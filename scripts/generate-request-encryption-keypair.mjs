import sodium from 'libsodium-wrappers-sumo';

await sodium.ready;

const keyPair = sodium.crypto_box_keypair();

console.log(`STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL=${encodeBase64Url(keyPair.privateKey)}`);
console.log(`NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=${encodeBase64Url(keyPair.publicKey)}`);
console.log('NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default');

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
