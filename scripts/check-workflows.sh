#!/usr/bin/env bash
set -euo pipefail

# Official actionlint v1.7.12 archives, verified against upstream checksums.
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_amd64; checksum=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 ;;
  Linux-aarch64|Linux-arm64) platform=linux_arm64; checksum=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6 ;;
  Darwin-arm64) platform=darwin_arm64; checksum=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f ;;
  Darwin-x86_64) platform=darwin_amd64; checksum=5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644 ;;
  *) echo "Unsupported platform; run actionlint 1.7.12 manually." >&2; exit 1 ;;
esac
actionlint_dir=$(mktemp -d)
trap 'rm -rf "$actionlint_dir"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_${platform}.tar.gz" \
  -o "$actionlint_dir/actionlint.tar.gz"
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$actionlint_dir/actionlint.tar.gz" | cut -d ' ' -f 1)
else
  actual=$(shasum -a 256 "$actionlint_dir/actionlint.tar.gz" | cut -d ' ' -f 1)
fi
if [ "$actual" != "$checksum" ]; then echo "actionlint checksum mismatch" >&2; exit 1; fi
tar -xzf "$actionlint_dir/actionlint.tar.gz" -C "$actionlint_dir" actionlint
# ShellCheck is optional on developer machines; YAML, expressions and actions
# are checked identically on every platform. Shell scripts use set -euo pipefail.
"$actionlint_dir/actionlint" -shellcheck= -pyflakes= -color
