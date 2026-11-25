#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "Usa lanzar.cmd en Windows."; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) echo "Arquitectura de Node no compatible."; exit 1 ;;
esac
mkdir -p .cacahuete
export PATH="$PWD/.cacahuete/node/bin:$HOME/Applications/Ollama.app/Contents/Resources:$PATH"
if [[ "$os" == linux && -f /etc/fedora-release ]]; then
  missing=()
  for tool in curl tar gzip zstd; do
    command -v "$tool" >/dev/null || missing+=("$tool")
  done
  if (( ${#missing[@]} )); then sudo dnf install -y "${missing[@]}"; fi
fi
if ! node -e 'process.exit(+(process.versions.node.split(".")[0] !== "22" || Number(process.versions.node.split(".")[1]) < 13))' 2>/dev/null; then
  (
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  base=https://nodejs.org/dist/latest-v22.x
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/sums"
  file=$(awk -v suffix="-$os-$arch.tar.gz" 'index($2,suffix) && $2 ~ /\.tar\.gz$/ {print $2; exit}' "$tmp/sums")
  test -n "$file"
  version=${file#node-}; version=${version%%-*}
  curl -fL "https://nodejs.org/dist/$version/$file" -o "$tmp/$file"
  (cd "$tmp"; awk -v file="$file" '$2==file' sums > checksum
   if command -v sha256sum >/dev/null; then sha256sum -c checksum; else shasum -a 256 -c checksum; fi)
  mkdir -p .cacahuete/node
  tar -xzf "$tmp/$file" -C .cacahuete/node --strip-components=1
  )
fi
if ! command -v ollama >/dev/null; then
  if [[ "$os" == darwin && -x /Applications/Ollama.app/Contents/Resources/ollama ]]; then
    export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"
  elif [[ "$os" == darwin ]] && command -v brew >/dev/null; then
    brew install ollama
  elif [[ "$os" == darwin ]]; then
    (
      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"' EXIT
      curl -fL https://ollama.com/download/Ollama.dmg -o "$tmp/Ollama.dmg"
      mkdir "$tmp/volume"
      hdiutil attach "$tmp/Ollama.dmg" -readonly -nobrowse -mountpoint "$tmp/volume"
      trap 'hdiutil detach "$tmp/volume" && rm -rf "$tmp"' EXIT
      mkdir -p "$HOME/Applications"
      ditto "$tmp/volume/Ollama.app" "$HOME/Applications/Ollama.app"
    )
  else
    curl -fsSL https://ollama.com/install.sh -o .cacahuete/install-ollama.sh
    sh .cacahuete/install-ollama.sh
    export PATH="/Applications/Ollama.app/Contents/Resources:/usr/local/bin:$PATH"
  fi
fi
exec node --env-file-if-exists=backend/.env scripts/lanzar.mjs
