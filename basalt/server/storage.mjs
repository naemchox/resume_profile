// Storage: blobs on disk, permissions as RLS policies on storage.objects.
//
// The metadata row is the security object. A caller may only download a file if
// a SELECT on its storage.objects row succeeds under their role — so file
// permissions use the exact same policy language as application data.

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { asRole, asSuperuser } from './db.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });

let root = null;
let signingKey = null;

export function configureStorage({ dataDir, key }) {
  root = join(dataDir, 'storage');
  signingKey = key;
}

const blobPath = (id) => join(root, id.slice(0, 2), id);

// Buckets and objects are isolated per project by namespacing the bucket id as
// `<projectId>::<bucket>`. The server always builds the qualified id from the
// resolved project, so a client can never reach another tenant's storage.
const qualify = (projectId, bucket) => `${projectId ?? 'default'}::${bucket}`;
const unqualify = (qualified) => qualified.slice(qualified.indexOf('::') + 2);

export async function createBucket(projectId, id, { public: isPublic = false } = {}) {
  const qid = qualify(projectId, id);
  await asSuperuser((tx) =>
    tx.query(`insert into storage.buckets (id, public) values ($1, $2) on conflict (id) do update set public = excluded.public`, [qid, isPublic]),
  );
  return { id, public: isPublic };
}

export async function listBuckets(projectId) {
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select * from storage.buckets where id like $1 order by id`, [`${projectId ?? 'default'}::%`]));
  return rows.map((b) => ({ ...b, id: unqualify(b.id) }));
}

/**
 * Upload. The metadata INSERT runs as the caller, so the WITH CHECK clause of
 * their policies decides whether the write is allowed. The blob only hits disk
 * after Postgres has said yes.
 */
export async function upload({ bucket, name, body, mimeType, identity }) {
  if (identity.role === 'anon') throw httpError(401, 'authentication required to upload');

  const qid = qualify(identity.projectId, bucket);
  const id = randomUUID();
  const row = await asRole(identity.role, identity.claims, async (tx) => {
    const { rows } = await tx.query(
      `insert into storage.objects (id, bucket_id, name, owner, size, mime_type)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (bucket_id, name) do update
         set size = excluded.size, mime_type = excluded.mime_type, updated_at = now()
       returning *`,
      [id, qid, name, identity.userId, body.length, mimeType ?? 'application/octet-stream'],
    );
    if (!rows.length) throw httpError(403, 'storage policy denied this upload');
    return rows[0];
  }).catch((err) => {
    // A policy violation surfaces as a Postgres error, not an empty result.
    if (err.code === '42501' || /row-level security/i.test(err.message)) {
      throw httpError(403, 'storage policy denied this upload');
    }
    throw err;
  });

  const path = blobPath(row.id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return { ...row, bucket_id: bucket }; // present the unqualified name back
}

/** Download. Visibility is decided entirely by whether the SELECT returns a row. */
export async function download({ bucket, name, identity }) {
  const qid = qualify(identity.projectId, bucket);
  const { rows } = await asRole(identity.role, identity.claims, (tx) =>
    tx.query(`select * from storage.objects where bucket_id = $1 and name = $2`, [qid, name]),
  );
  if (!rows.length) throw httpError(404, 'object not found'); // 404, not 403: do not confirm existence
  const row = rows[0];
  const body = await readFile(blobPath(row.id));
  return { body, mimeType: row.mime_type, size: row.size };
}

export async function remove({ bucket, name, identity }) {
  const qid = qualify(identity.projectId, bucket);
  const { rows } = await asRole(identity.role, identity.claims, (tx) =>
    tx.query(`delete from storage.objects where bucket_id = $1 and name = $2 returning *`, [qid, name]),
  );
  if (!rows.length) throw httpError(404, 'object not found');
  await unlink(blobPath(rows[0].id)).catch(() => {});
  return { ok: true };
}

export async function list({ bucket, prefix = '', identity }) {
  const qid = qualify(identity.projectId, bucket);
  const { rows } = await asRole(identity.role, identity.claims, (tx) =>
    tx.query(
      `select id, name, size, mime_type, created_at, updated_at
         from storage.objects where bucket_id = $1 and name like $2 || '%' order by name limit 1000`,
      [qid, prefix],
    ),
  );
  return rows;
}

// -----------------------------------------------------------------------------
// Signed URLs
// -----------------------------------------------------------------------------
// A signed URL grants bearer access to one object until it expires. The
// signature covers bucket, name AND expiry, so none of the three can be swapped.

export async function createSignedUrl({ bucket, name, expiresIn = 3600, identity }) {
  // Only issue a signature for an object the caller can already read.
  await download({ bucket, name, identity }).catch(() => {
    throw httpError(404, 'object not found');
  });
  // The URL carries the project-qualified bucket id, so downloadSigned can find
  // the object without an identity while staying inside the right tenant.
  const qid = qualify(identity.projectId, bucket);
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const sig = signObject(qid, name, exp);
  return { signedUrl: `/storage/v1/object/sign/${encodeURIComponent(qid)}/${name}?exp=${exp}&sig=${sig}`, expiresAt: exp };
}

function signObject(bucket, name, exp) {
  return createHmac('sha256', signingKey).update(`${bucket}:${name}:${exp}`).digest('base64url');
}

export async function downloadSigned({ bucket, name, exp, sig }) {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    throw httpError(401, 'signed url expired');
  }
  const expected = Buffer.from(signObject(bucket, name, expNum));
  const actual = Buffer.from(String(sig || ''));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw httpError(401, 'invalid signature');
  }
  // Signature verified: read past RLS deliberately, that is what signing means.
  const { rows } = await asSuperuser((tx) =>
    tx.query(`select * from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]),
  );
  if (!rows.length) throw httpError(404, 'object not found');
  const body = await readFile(blobPath(rows[0].id));
  return { body, mimeType: rows[0].mime_type };
}
