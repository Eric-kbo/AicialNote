#!/bin/sh
# Installs a new AicialNote server binary read from stdin, then restarts the service.
#
# Lives on the server as /usr/local/sbin/aicialnote-install (root-owned, mode 755). The CI deploy key can run only
# this, through sudo: its authorized_keys line is
#   restrict,command="sudo -n /usr/local/sbin/aicialnote-install" ssh-ed25519 AAAA... aicialnote-deploy
# and /etc/sudoers.d/aicialnote-deploy holds
#   deploy ALL=(root) NOPASSWD: /usr/local/sbin/aicialnote-install ""
#
# The old binary is kept as aicialnote.bak-YYYYMMDD-HHMMSS. If the new one doesn't answer on the local port, the old
# one is put back and the script fails, so the CI run turns red.
set -eu

dir=/opt/aicialnote
bin="$dir/aicialnote"
url=http://127.0.0.1:18001/
keep=20

tmp=$(mktemp "$dir/.incoming.XXXXXX")
trap 'rm -f "$tmp" "$bin.new"' EXIT
# A dropped SSH connection sends HUP; exit so the EXIT trap still cleans up.
trap 'exit 1' HUP INT TERM

# 100 MB cap; the real binary is about 15 MB.
head -c 104857600 >"$tmp"
size=$(wc -c <"$tmp")
if [ "$size" -lt 1000000 ] || [ "$(head -c 4 "$tmp" | tail -c 3)" != "ELF" ]; then
  echo "refusing: input is not a Linux binary ($size bytes)" >&2
  exit 1
fi

backup="$bin.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$bin" "$backup"
install -m 755 -o root -g root "$tmp" "$bin.new"
mv -f "$bin.new" "$bin"
systemctl restart aicialnote

healthy() {
  i=0
  while [ $i -lt 20 ]; do
    sleep 1
    if curl -fsS -o /dev/null "$url"; then return 0; fi
    i=$((i + 1))
  done
  return 1
}

if ! healthy; then
  echo "new binary did not come up, rolling back to $backup" >&2
  install -m 755 -o root -g root "$backup" "$bin.new"
  mv -f "$bin.new" "$bin"
  systemctl restart aicialnote
  exit 1
fi

# Keep the newest $keep backups.
ls -1t "$bin".bak-* 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -f --

echo "deployed $(sha256sum "$bin" | cut -d' ' -f1), previous kept as $(basename "$backup")"
