// REST layer: compiles a PostgREST-style query string into parameterized SQL.
//
// SECURITY CONTRACT — the whole file exists to uphold these two rules:
//
//   1. No client-supplied string is ever interpolated into SQL as an identifier
//      unless it was first looked up in the catalog (db.mjs). Unknown table or
//      column -> 400, never a query.
//   2. No client-supplied string is ever interpolated as a *value*. Values
//      become $1..$n bind parameters, always.
//
// Authorization is not this file's job. It happens because every statement runs
// inside asRole(), where Postgres applies RLS. This layer cannot grant access it
// does not have, and a bug here cannot leak another tenant's rows.

import { q, getTable, assertColumn, findRelation } from './db.mjs';

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Whitelisted operators. Anything not in this map is rejected outright.
const OPERATORS = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'like', ilike: 'ilike',
  in: 'in', is: 'is',
  cs: '@>', cd: '<@', ov: '&&',   // array/range contains, contained-by, overlaps
  fts: '@@',                       // full-text search
};

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'on_conflict']);

// -----------------------------------------------------------------------------
// Bind-parameter accumulator
// -----------------------------------------------------------------------------
class Params {
  constructor() { this.values = []; }
  add(v) { this.values.push(v); return `$${this.values.length}`; }
}

// -----------------------------------------------------------------------------
// select= parser
// -----------------------------------------------------------------------------
// Grammar:  field := [alias ':'] name [ '(' field (',' field)* ')' ]
// Splits on commas that are not inside parentheses.
function splitTop(str) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  if (depth !== 0) throw bad('unbalanced parentheses in select');
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseSelect(str) {
  return splitTop(str).map((tok) => {
    const open = tok.indexOf('(');
    if (open === -1) {
      const [alias, name] = tok.includes(':') ? tok.split(':', 2) : [null, tok];
      return { kind: 'column', name: name.trim(), alias: alias?.trim() ?? null };
    }
    if (!tok.endsWith(')')) throw bad(`malformed embed: ${tok}`);
    const head = tok.slice(0, open).trim();
    const body = tok.slice(open + 1, -1);
    const [alias, name] = head.includes(':') ? head.split(':', 2) : [null, head];
    return {
      kind: 'embed',
      name: name.trim(),
      alias: (alias ?? name).trim(),
      fields: body.trim() ? parseSelect(body) : [{ kind: 'column', name: '*', alias: null }],
    };
  });
}

let aliasSeq = 0;
const nextAlias = () => `_e${++aliasSeq}`;

/** Build the SQL projection list for a table, resolving embeds into correlated subqueries. */
function buildProjection(tbl, fields, selfAlias, params) {
  const parts = [];
  for (const f of fields) {
    if (f.kind === 'column') {
      if (f.name === '*') { parts.push(`${selfAlias}.*`); continue; }
      assertColumn(tbl, f.name);
      parts.push(`${selfAlias}.${q(f.name)}${f.alias ? ` as ${q(f.alias)}` : ''}`);
      continue;
    }

    // Embedded resource. Resolve direction from the foreign keys.
    const target = getTable(tbl.schema, f.name) ?? getTable('public', f.name);
    if (!target) throw bad(`unknown embedded table "${f.name}"`);
    const rel = findRelation(tbl, target);
    if (!rel) throw bad(`no foreign key relationship between ${tbl.name} and ${f.name}`);

    const ea = nextAlias();
    const on = rel.localCols
      .map((lc, i) => `${ea}.${q(rel.remoteCols[i])} = ${selfAlias}.${q(lc)}`)
      .join(' and ');

    // Expand '*' so json_build_object has explicit keys.
    const inner = f.fields.length === 1 && f.fields[0].name === '*'
      ? [...target.columns.keys()].map((c) => ({ kind: 'column', name: c, alias: null }))
      : f.fields;

    const obj = buildJsonObject(target, inner, ea, params);
    const from = `${q(target.schema)}.${q(target.name)} ${ea}`;

    // RLS applies inside these subqueries too: the subscriber only ever sees
    // embedded rows their policies permit.
    if (rel.kind === 'to-many') {
      parts.push(`(select coalesce(json_agg(${obj}), '[]'::json) from ${from} where ${on}) as ${q(f.alias)}`);
    } else {
      parts.push(`(select ${obj} from ${from} where ${on} limit 1) as ${q(f.alias)}`);
    }
  }
  return parts.join(', ');
}

function buildJsonObject(tbl, fields, alias, params) {
  const kv = [];
  for (const f of fields) {
    if (f.kind === 'column') {
      assertColumn(tbl, f.name);
      // The key is bound, not interpolated (aliases are client-supplied), but it
      // must be cast: Postgres cannot infer a bare $n's type in json_build_object.
      kv.push(`${params.add(f.alias ?? f.name)}::text, ${alias}.${q(f.name)}`);
    } else {
      const target = getTable(tbl.schema, f.name) ?? getTable('public', f.name);
      if (!target) throw bad(`unknown embedded table "${f.name}"`);
      const rel = findRelation(tbl, target);
      if (!rel) throw bad(`no foreign key relationship between ${tbl.name} and ${f.name}`);
      const ea = nextAlias();
      const on = rel.localCols.map((lc, i) => `${ea}.${q(rel.remoteCols[i])} = ${alias}.${q(lc)}`).join(' and ');
      const inner = f.fields.length === 1 && f.fields[0].name === '*'
        ? [...target.columns.keys()].map((c) => ({ kind: 'column', name: c, alias: null }))
        : f.fields;
      const obj = buildJsonObject(target, inner, ea, params);
      const from = `${q(target.schema)}.${q(target.name)} ${ea}`;
      const sub = rel.kind === 'to-many'
        ? `(select coalesce(json_agg(${obj}), '[]'::json) from ${from} where ${on})`
        : `(select ${obj} from ${from} where ${on} limit 1)`;
      kv.push(`${params.add(f.alias)}::text, ${sub}`);
    }
  }
  return `json_build_object(${kv.join(', ')})`;
}

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------
/** `eq.5` / `in.(1,2,3)` / `is.null` -> SQL fragment, values bound. */
function buildCondition(tbl, alias, col, spec, params) {
  assertColumn(tbl, col);

  let negate = false;
  let rest = spec;
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4); }

  const dot = rest.indexOf('.');
  if (dot === -1) throw bad(`malformed filter for "${col}": ${spec}`);
  const op = rest.slice(0, dot);
  const raw = rest.slice(dot + 1);

  if (!Object.hasOwn(OPERATORS, op)) throw bad(`unknown operator "${op}"`);
  const sqlOp = OPERATORS[op];
  const lhs = `${alias}.${q(col)}`;

  let frag;
  if (op === 'is') {
    // `is` takes only these three literals — never a bind parameter.
    const lit = raw.toLowerCase();
    if (!['null', 'true', 'false'].includes(lit)) throw bad(`"is" expects null|true|false, got "${raw}"`);
    frag = `${lhs} is ${lit}`;
  } else if (op === 'in') {
    if (!raw.startsWith('(') || !raw.endsWith(')')) throw bad('"in" expects (a,b,c)');
    const items = splitTop(raw.slice(1, -1)).map((s) => s.replace(/^"(.*)"$/, '$1'));
    if (!items.length) return negate ? 'true' : 'false';
    frag = `${lhs} in (${items.map((v) => params.add(v)).join(', ')})`;
  } else if (op === 'fts') {
    frag = `to_tsvector('english', ${lhs}) @@ plainto_tsquery('english', ${params.add(raw)})`;
  } else if (op === 'cs' || op === 'cd' || op === 'ov') {
    // Array/jsonb containment. Cast the bind param to the column's own type.
    const type = tbl.columns.get(col).type;
    frag = `${lhs} ${sqlOp} ${params.add(raw)}::${type}`;
  } else {
    frag = `${lhs} ${sqlOp} ${params.add(raw)}`;
  }
  return negate ? `not (${frag})` : frag;
}

/** `or=(a.eq.1,b.gt.2)` — recursive, so `or=(a.eq.1,and=(b.eq.2,c.eq.3))` works. */
function buildLogic(tbl, alias, joiner, body, params) {
  if (!body.startsWith('(') || !body.endsWith(')')) throw bad(`"${joiner}" expects (...)`);
  const parts = splitTop(body.slice(1, -1)).map((tok) => {
    if (tok.startsWith('or=') || tok.startsWith('and=')) {
      const [kw, ...r] = tok.split('=');
      return buildLogic(tbl, alias, kw, r.join('='), params);
    }
    const dot = tok.indexOf('.');
    if (dot === -1) throw bad(`malformed condition: ${tok}`);
    return buildCondition(tbl, alias, tok.slice(0, dot), tok.slice(dot + 1), params);
  });
  if (!parts.length) return 'true';
  return `(${parts.join(joiner === 'or' ? ' or ' : ' and ')})`;
}

function buildWhere(tbl, alias, searchParams, params) {
  const clauses = [];
  for (const [key, value] of searchParams.entries()) {
    if (key === 'or' || key === 'and') { clauses.push(buildLogic(tbl, alias, key, value, params)); continue; }
    if (RESERVED.has(key)) continue;
    clauses.push(buildCondition(tbl, alias, key, value, params));
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

function buildOrder(tbl, alias, spec) {
  if (!spec) return '';
  const terms = spec.split(',').map((t) => {
    const [col, ...mods] = t.trim().split('.');
    assertColumn(tbl, col);
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst') ? ' nulls first'
                : mods.includes('nullslast')  ? ' nulls last' : '';
    return `${alias}.${q(col)} ${dir}${nulls}`;
  });
  return `order by ${terms.join(', ')}`;
}

function boundedInt(raw, fallback, max) {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) throw bad('limit/offset must be a non-negative integer');
  return Math.min(n, max);
}

// -----------------------------------------------------------------------------
// Statement builders
// -----------------------------------------------------------------------------
const MAX_ROWS = 10_000;
const DEFAULT_LIMIT = 1_000;

export function compileSelect(schema, table, searchParams) {
  const tbl = getTable(schema, table);
  if (!tbl) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });

  const params = new Params();
  const alias = '_b';
  const fields = parseSelect(searchParams.get('select') || '*');
  const projection = buildProjection(tbl, fields, alias, params);
  const where = buildWhere(tbl, alias, searchParams, params);
  const order = buildOrder(tbl, alias, searchParams.get('order'));
  const limit = boundedInt(searchParams.get('limit'), DEFAULT_LIMIT, MAX_ROWS);
  const offset = boundedInt(searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER);

  const text =
    `select ${projection} from ${q(schema)}.${q(table)} ${alias} ${where} ${order} ` +
    `limit ${limit} offset ${offset}`;
  return { text, values: params.values, tbl, where, alias };
}

export function compileCount(schema, table, searchParams) {
  const tbl = getTable(schema, table);
  const params = new Params();
  const where = buildWhere(tbl, '_b', searchParams, params);
  return { text: `select count(*)::bigint as n from ${q(schema)}.${q(table)} _b ${where}`, values: params.values };
}

export function compileInsert(schema, table, body, { onConflict, returning }) {
  const tbl = getTable(schema, table);
  if (!tbl) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });

  const rows = Array.isArray(body) ? body : [body];
  if (!rows.length) throw bad('empty insert body');

  // Every row must present the same column set; the union of keys is the shape.
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  if (!cols.length) throw bad('insert body has no columns');
  cols.forEach((c) => assertColumn(tbl, c));

  const params = new Params();
  const tuples = rows.map(
    (r) => `(${cols.map((c) => (r[c] === undefined ? 'default' : params.add(serialize(r[c])))).join(', ')})`,
  );

  let text = `insert into ${q(schema)}.${q(table)} (${cols.map(q).join(', ')}) values ${tuples.join(', ')}`;

  if (onConflict) {
    const conflictCols = onConflict.split(',').map((c) => assertColumn(tbl, c.trim()));
    const updates = cols.filter((c) => !conflictCols.includes(c));
    text += updates.length
      ? ` on conflict (${conflictCols.map(q).join(', ')}) do update set ${updates.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`
      : ` on conflict (${conflictCols.map(q).join(', ')}) do nothing`;
  }
  if (returning) text += ' returning *';
  return { text, values: params.values };
}

export function compileUpdate(schema, table, body, searchParams, { returning, allowUnfiltered }) {
  const tbl = getTable(schema, table);
  if (!tbl) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });

  const cols = Object.keys(body || {});
  if (!cols.length) throw bad('empty update body');
  cols.forEach((c) => assertColumn(tbl, c));

  const params = new Params();
  const sets = cols.map((c) => `${q(c)} = ${params.add(serialize(body[c]))}`).join(', ');
  const where = buildWhere(tbl, q(table), searchParams, params);

  // RLS still protects other tenants' rows, but an unfiltered UPDATE would
  // happily rewrite every row the caller *does* own. Require intent.
  if (!where && !allowUnfiltered) {
    throw bad('unfiltered update refused; add a filter or send Prefer: allow-unfiltered');
  }

  let text = `update ${q(schema)}.${q(table)} as ${q(table)} set ${sets} ${where}`;
  if (returning) text += ' returning *';
  return { text, values: params.values };
}

export function compileDelete(schema, table, searchParams, { returning, allowUnfiltered }) {
  const tbl = getTable(schema, table);
  if (!tbl) throw Object.assign(new Error(`unknown table ${schema}.${table}`), { status: 404 });

  const params = new Params();
  const where = buildWhere(tbl, q(table), searchParams, params);
  if (!where && !allowUnfiltered) {
    throw bad('unfiltered delete refused; add a filter or send Prefer: allow-unfiltered');
  }
  let text = `delete from ${q(schema)}.${q(table)} as ${q(table)} ${where}`;
  if (returning) text += ' returning *';
  return { text, values: params.values };
}

/** Objects and arrays go to Postgres as JSON text; the column type coerces them. */
function serialize(v) {
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

export function parsePrefer(header = '') {
  const prefs = String(header).split(',').map((s) => s.trim());
  return {
    returning: prefs.includes('return=representation'),
    count: prefs.includes('count=exact'),
    allowUnfiltered: prefs.includes('allow-unfiltered'),
    resolution: prefs.find((p) => p.startsWith('resolution='))?.split('=')[1] ?? null,
  };
}
