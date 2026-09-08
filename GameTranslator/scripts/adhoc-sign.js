// electron-builder afterPack hook — ad-hoc sign the packed .app before it is put into a dmg.
//
// WHY THIS EXISTS. build.mac.identity is null, which tells electron-builder to skip signing
// altogether ("skipped macOS code signing  reason=identity explicitly is set to null"). What it
// leaves behind is not an unsigned app — it is the signature Electron's own prebuilt binary shipped
// with, which no longer matches once our code, icon and native helpers are inside the bundle. macOS
// reports that as:
//
//     code has no resources but signature indicates they must be present
//
// and on Apple Silicon an invalid signature is fatal, not a warning: the app does not launch at all,
// and the user is told it is "damaged" with no Open Anyway to click. Verified against the real
// download on 2026-08-03 — dmg from the public release, quarantine attribute set as a browser would,
// double-click: nothing happened. Every person arriving from a link would have hit that.
//
// An AD-HOC signature (`codesign --sign -`) is free, needs no Apple account, and is valid. It does
// not make the app trusted — Gatekeeper still shows "unidentified developer" and still wants
// Privacy & Security → Open Anyway, which is what the website documents. It only moves the app from
// "refuses to run" to "runs after you say yes", which is the whole difference between a download
// that converts and one that doesn't.
//
// Replace this with a real Developer ID once there is revenue to justify the $99/yr — set
// build.mac.identity to the certificate name and this hook becomes a no-op worth deleting.
//
// GLOSS_SIGN_IDENTITY — for jek's own machine, not for releases. An ad-hoc signature has no
// certificate, so the app's designated requirement can only be its cdhash, which is a hash of the
// bundle's contents and therefore a DIFFERENT value after every build. macOS keys TCC grants to
// that requirement, so Screen Recording — which the glass needs, and without which the pill just
// stays opaque — has to be granted again after every single rebuild. Signing with any stable
// certificate, even a self-signed one, moves the requirement to `identifier + certificate leaf`,
// which does not change when the code does, and the grant survives. `npm run pack:dev` sets this.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const identity = process.env.GLOSS_SIGN_IDENTITY || '-';
  // --deep is deprecated by Apple but remains the only one-shot way to reach every nested helper and
  // framework in an Electron bundle; the alternative is walking Frameworks/ by hand for no gain
  // while the signature stays ad-hoc either way.
  execFileSync('codesign', ['--force', '--deep', '--sign', identity, app], { stdio: 'inherit' });
  // Verify here rather than trusting the exit code: a signature that codesign writes happily can
  // still fail validation, and finding that out at build time beats finding it out from a user.
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log(`  • signed (${identity === '-' ? 'ad-hoc' : identity}) and verified  ${app}`);
};
