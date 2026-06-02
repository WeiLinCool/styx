# Libsodium Request Envelope Design

Date: 2026-06-01
Status: Approved for planning

## Problem

The current request encryption depends on browser Web Crypto. Public HTTP deployments fail because `crypto.subtle` is unavailable outside secure browser contexts. The product also needs App and Desktop clients, so request confidentiality should use one cross-platform application-layer protocol instead of a browser-only primitive.

The accepted threat model is narrow: protect sensitive request bodies from passive network capture. This design does not claim to protect Web HTTP users from active man-in-the-middle JavaScript replacement. App and Desktop clients can later strengthen this with bundled public keys or pinning.

## Research Summary

Industry consensus: do not hand-roll encryption protocols. Use a reviewed public-key encryption primitive or standard envelope. TLS remains the normal way to protect Web code delivery and active tampering, but application-layer encryption can still reduce passive data exposure when HTTPS is unavailable.

References:

- MDN `SubtleCrypto.digest()`: Web Crypto digest is only available in secure contexts.
- libsodium sealed boxes: sender encrypts to a recipient public key; only the recipient private key can decrypt; sender identity is anonymous.
- RFC 9180 HPKE: standardized hybrid public-key encryption suitable for request envelopes, but heavier to introduce consistently across this codebase today.

Transferable principle: use mature public-key encryption with explicit algorithm and key identifiers, version every envelope, keep replay/idempotency controls outside the ciphertext, and preserve server-side validation authority after decryption.

Repository constraints: API routes already call `readJsonBody`, request metadata/idempotency is enforced by `src/server/request-security.ts`, and user/admin clients share `src/lib/user-api-client.ts`. The change should keep route files thin and avoid database schema changes.

## Goals

- Replace browser-WebCrypto-only request encryption with a cross-platform request envelope.
- Support Web over HTTP for the accepted passive-capture threat model.
- Use libsodium sealed boxes for sensitive request bodies.
- Keep existing request metadata, idempotency, timestamp, nonce, and body-hash enforcement.
- Preserve existing route parsing and Zod validation after decryption.
- Provide a simple key configuration path for Docker deployments.
- Keep encrypted response support optional; first phase focuses on sensitive request confidentiality.

## Non-Goals

- Do not claim HTTP Web delivery is safe against active tampering.
- Do not build a full end-to-end messaging system.
- Do not introduce per-user device keys or sessions in this phase.
- Do not rotate keys automatically in the first implementation.
- Do not encrypt all API traffic immediately.

## Local Design

### Envelope

Client request bodies for sensitive mutations use:

```json
{
  "encrypted": true,
  "v": 2,
  "alg": "x25519-xsalsa20poly1305-sealedbox",
  "kid": "default",
  "ciphertext": "base64url"
}
```

`ciphertext` is the libsodium sealed-box encryption of the original JSON request body bytes.

### Key Ownership

Server owns the private key.

Environment variables:

```env
STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL=<base64url 32-byte private key>
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=<base64url 32-byte public key>
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default
```

The public key is safe to expose. The private key must only exist in server/runtime env.

### Client Behavior

`src/lib/request-encryption.ts` becomes the cross-platform envelope module. For mutation request strings:

1. If a public key is configured and libsodium initializes, encrypt to v2 sealed-box envelope.
2. Otherwise fall back according to transport mode:
   - `insecure`: send plaintext JSON for compatibility.
   - default/compatible/strict: keep existing failure behavior for missing crypto once v2 is fully required.

First implementation keeps the existing plaintext fallback in HTTP-insecure mode to avoid business outage.

### Server Behavior

`readJsonBody` detects:

- v2 sealed-box envelope: decrypt with configured private key, then parse JSON.
- v1 legacy envelope: use current decryptor for compatibility.
- plaintext JSON: accept only while current transport policy allows it.

Request body hash validation must accept the hash of:

- parsed JSON stable body,
- raw request body,
- decrypted plaintext body when an encrypted envelope is used.

### Invariants

- The private key never goes to client bundles.
- Every encrypted envelope carries `v`, `alg`, and `kid`.
- Decryption happens before route-level Zod validation.
- Request metadata and idempotency remain outside the ciphertext.
- Plaintext fallback is a compatibility mode, not a security claim.

## Rollout

1. Add libsodium envelope module and tests.
2. Configure Docker/env with a generated keypair.
3. Encrypt sensitive login and password request bodies via the shared API client.
4. Keep legacy v1 decrypt support until the deployed clients are replaced.
5. After Web/App/Desktop converge on v2, remove v1 and narrow plaintext fallback.

## Verification

- Unit tests for v2 envelope round trip.
- Unit tests for missing key fallback.
- API guard tests for decrypted body hash validation.
- Route tests for login with v2 envelope.
- `pnpm build` and focused Docker image build before deployment.
