// Link-preview address rules: private, loopback, link-local, CGNAT and unique-local targets are
// refused, public hosts pass. Runs the real module (Node strips the types), no dev server needed.
// Needs network only for the last check, which resolves example.com over DNS-over-HTTPS.
import { isPrivateAddress, isPublicHost, isSafePreviewUrl, resolveWithDoh } from '../app/lib/link-preview.ts';

let failed = 0;
function check(name, ok) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

// Address ranges.
const blocked = [
  '127.0.0.1', '127.255.255.254', '0.0.0.0', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
  '192.168.0.1', '192.168.255.255', '169.254.169.254', '169.254.0.1', '100.64.0.1', '100.127.255.255',
  '192.0.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
  '::1', '::', 'fc00::1', 'fd12:3456:789a::1', 'fdff::1', 'fe80::1', 'fe80::1%en0', 'ff02::1',
  '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::a00:1',
  '2002:c0a8:101::1', '2001:db8::1', '[::1]', 'not an address', '999.1.1.1',
];
for (const address of blocked) check(`address ${address} is private`, isPrivateAddress(address));

const open = ['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '192.169.0.1', '2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8'];
for (const address of open) check(`address ${address} is public`, !isPrivateAddress(address));

// Hostnames, with a stub resolver so the cases are deterministic.
const table = {
  'public.test': ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'],
  'private-a.test': ['10.0.0.5'],
  'private-aaaa.test': ['93.184.216.34', 'fd00::1'],
  'cgnat.test': ['100.64.1.1'],
  'linklocal.test': ['169.254.169.254'],
  'mapped.test': ['::ffff:192.168.1.1'],
  'empty.test': [],
};
const stub = async (host) => table[host] ?? null;
for (const host of ['localhost', 'LOCALHOST.', 'app.localhost', 'printer.local', 'db.internal', 'router.lan', '127.0.0.1', '10.1.2.3', '192.168.1.10', '169.254.169.254', '100.64.0.9', '[::1]', 'fc00::5', 'private-a.test', 'private-aaaa.test', 'cgnat.test', 'linklocal.test', 'mapped.test', 'empty.test', 'unresolvable.test']) {
  check(`host ${host} is rejected`, !(await isPublicHost(host, stub)));
}
check('host public.test (A and AAAA public) is allowed', await isPublicHost('public.test', stub));

// URL-level name check still in front of DNS.
for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'ftp://example.com/', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://intranet/']) {
  check(`url ${url} is refused`, !isSafePreviewUrl(url));
}
check('url https://example.com/ passes the name check', isSafePreviewUrl('https://example.com/'));

// Live DNS-over-HTTPS: a real public site resolves to public addresses and a loopback name does not.
const live = await resolveWithDoh('example.com');
if (!live) {
  console.log('SKIP live DNS-over-HTTPS (cloudflare-dns.com unreachable from here)');
} else {
  check(`live: example.com resolves (${live.slice(0, 2).join(', ')})`, live.length > 0);
  check('live: example.com is allowed', await isPublicHost('example.com'));
  check('live: localhost is rejected without DNS', !(await isPublicHost('localhost')));
}

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
