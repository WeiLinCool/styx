# Libsodium Request Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-WebCrypto-only request encryption with a libsodium sealed-box request envelope that works across Web, App, and Desktop for passive-capture protection.

**Architecture:** Keep encryption/decryption in `src/lib/request-encryption.ts`, route parsing in `src/server/api-request-guard.ts`, and deployment key configuration in environment variables. Clients use the same `encryptRequestBody` API, while the server accepts v2 sealed-box, legacy v1, and policy-controlled plaintext.

**Tech Stack:** Next.js App Router, TypeScript, `libsodium-wrappers-sumo`, existing user/admin API clients, existing request protection/idempotency.

---

### Task 1: Add v2 sealed-box envelope support

**Files:**
- Modify: `src/lib/request-encryption.ts`
- Modify: `src/lib/request-encryption.test.ts`

- [ ] **Step 1: Write failing v2 round-trip tests**

Add tests that generate a libsodium keypair, encrypt a JSON string with `encryptRequestBody`, assert the envelope has `v: 2`, `alg: "x25519-xsalsa20poly1305-sealedbox"`, and decrypt it back with `decryptRequestBody`.

Run: `pnpm exec tsx --test src/lib/request-encryption.test.ts`
Expected: fail because v2 support does not exist yet.

- [ ] **Step 2: Implement libsodium helpers**

Add:

```ts
export type RequestEncryptionKeyConfig = {
  keyId: string;
  publicKeyB64Url?: string;
  privateKeyB64Url?: string;
};
```

Use `libsodium-wrappers-sumo` `crypto_box_seal` and `crypto_box_seal_open` with base64url encoding helpers.

- [ ] **Step 3: Preserve legacy and plaintext behavior**

Keep current v1 AES-GCM envelope support for existing clients and keep plaintext fallback when no public key is configured.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec tsx --test src/lib/request-encryption.test.ts`
Expected: pass.

### Task 2: Wire server decryption config

**Files:**
- Modify: `src/server/api-request-guard.ts`
- Modify: `src/server/api-request-guard.test.ts`
- Modify: `src/server/request-security.ts`
- Modify: `src/server/request-security.test.ts`

- [ ] **Step 1: Write failing tests for v2 body reading**

Test that `readJsonBody` accepts a v2 envelope and returns the decrypted parsed body.

- [ ] **Step 2: Include decrypted plaintext in body hash candidates**

Extend `readJsonBody` to return decrypted plaintext raw body when available. Extend request protection to validate the client body hash against decrypted plaintext, raw envelope, and stable parsed body.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/api-request-guard.test.ts src/server/request-security.test.ts
```

Expected: pass.

### Task 3: Wire client public key config

**Files:**
- Modify: `src/lib/user-api-client.ts`
- Modify: `src/lib/user-api-client.test.ts`
- Modify: `src/lib/admin-api-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Test that when `NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL` and key id are available, mutation request bodies sent by the client are v2 encrypted envelopes.

- [ ] **Step 2: Implement default key loading**

Read:

```ts
process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL
process.env.NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID
```

Pass config to `encryptRequestBody`.

- [ ] **Step 3: Run client tests**

Run:

```bash
pnpm exec tsx --test src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts
```

Expected: pass.

### Task 4: Add key generation documentation and deployment checks

**Files:**
- Modify: `docs/development/docker-compose-deployment.md`
- Create: `scripts/generate-request-encryption-keypair.mjs`

- [ ] **Step 1: Add key generation script**

Use `libsodium-wrappers-sumo` to print:

```env
STYX_REQUEST_ENCRYPTION_PRIVATE_KEY_B64URL=...
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=...
NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default
```

- [ ] **Step 2: Document Docker env usage**

Document that server env needs private key and public key, while client build/runtime needs the public key env.

- [ ] **Step 3: Run script**

Run: `node scripts/generate-request-encryption-keypair.mjs`
Expected: prints three env lines.

### Task 5: Verify and rebuild deployment image

**Files:**
- No source files beyond previous tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/lib/request-encryption.test.ts src/server/api-request-guard.test.ts src/server/request-security.test.ts src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts
```

- [ ] **Step 2: Run production build**

Run: `pnpm build`
Expected: pass.

- [ ] **Step 3: Build Docker image**

Run:

```bash
export APP_IMAGE=styx-webui:prod-$(date +%Y%m%d%H%M)
docker buildx build --platform linux/amd64 -t "$APP_IMAGE" --load .
```

- [ ] **Step 4: Export image**

Run:

```bash
docker save "$APP_IMAGE" | gzip > "deploy-artifacts/${APP_IMAGE//:/-}.tar.gz"
echo "$APP_IMAGE" > deploy-artifacts/app-image.txt
gzip -t "deploy-artifacts/${APP_IMAGE//:/-}.tar.gz"
```

Expected: tarball is valid.
