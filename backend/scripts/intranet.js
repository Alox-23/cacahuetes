// The event network takes priority over VPN and virtual adapters. Keep other LANs usable.
export function intranetUrls(interfaces, port) {
  const entries = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? []).filter(ip => ip.family === 'IPv4' && !ip.internal)
      .map(ip => ({ name, address: ip.address, url: `http://${ip.address}:${port}` })));
  const priority = entry => Number(entry.address.startsWith('10.10.83.'));
  return entries.sort((a, b) => priority(b) - priority(a));
}
