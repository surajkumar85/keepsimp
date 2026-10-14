#!/bin/sh
# Makes the certificates the tests of trusted issuers use, with OpenSSL 3.4 or later:
# a root, an intermediate it issued, a signer the intermediate issued (with
# its key, in signer.p12, password "keepsimp"), a second root no one issued
# anything from, a certificate that may not issue others but did, and one
# with no extensions at all that did too.
# Keys are thrown away; only certificates and the .p12 files are kept.
set -eu
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
from=20260101000000Z
to=20460101000000Z
key() { openssl genpkey -quiet -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$work/$1.key"; }
ca() {
  printf 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n' > "$work/ca.ext"
}
leaf() {
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\n' > "$work/leaf.ext"
}
ca; leaf
# Roots sign themselves.
for pair in "root:KeepSimp Trust Root" "other-root:KeepSimp Other Root"; do
  root=${pair%%:*}
  set -- "$root" "${pair#*:}"
  key "$root"
  openssl req -new -key "$work/$root.key" -subj "/CN=$2/O=KeepSimp Tests" -out "$work/$root.csr"
  openssl x509 -req -in "$work/$root.csr" -key "$work/$root.key" -not_before $from -not_after $to -extfile "$work/ca.ext" -out "$root.crt"
done
issue() { # name subject issuer extfile
  key "$1"
  openssl req -new -key "$work/$1.key" -subj "$2" -out "$work/$1.csr"
  openssl x509 -req -in "$work/$1.csr" -CA "$3.crt" -CAkey "$work/$3.key" -set_serial "0x$(openssl rand -hex 8)" -not_before $from -not_after $to -extfile "$4" -out "$1.crt"
}
cp root.crt "$work/root.crt"
issue intermediate "/CN=KeepSimp Trust Intermediate/O=KeepSimp Tests" root "$work/ca.ext"
issue signer "/CN=Robin Trust/O=KeepSimp Tests" intermediate "$work/leaf.ext"
issue not-an-issuer "/CN=Not An Issuer/O=KeepSimp Tests" root "$work/leaf.ext"
issue under-leaf "/CN=Under A Leaf/O=KeepSimp Tests" not-an-issuer "$work/leaf.ext"
: > "$work/none.ext"
issue plain-issuer "/CN=Plain Issuer/O=KeepSimp Tests" root "$work/none.ext"
issue under-plain "/CN=Under A Plain Issuer/O=KeepSimp Tests" plain-issuer "$work/leaf.ext"
cat intermediate.crt > "$work/chain.crt"
openssl pkcs12 -export -inkey "$work/signer.key" -in signer.crt -certfile "$work/chain.crt" -name signer -passout pass:keepsimp -out signer.p12
openssl pkcs12 -export -inkey "$work/under-leaf.key" -in under-leaf.crt -certfile not-an-issuer.crt -name under-leaf -passout pass:keepsimp -out under-leaf.p12
openssl pkcs12 -export -inkey "$work/under-plain.key" -in under-plain.crt -certfile plain-issuer.crt -name under-plain -passout pass:keepsimp -out under-plain.p12
# The root again, in DER, and two roots in one PEM file.
openssl x509 -in root.crt -outform DER -out root.der
cat root.crt other-root.crt > two-roots.crt
rm -f ./*.srl
