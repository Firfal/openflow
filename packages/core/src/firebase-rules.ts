/**
 * Canonical OpenFlow security rules. Sites may add their own rules outside the
 * `// BEGIN cms` / `// END cms` markers; the block itself must stay identical (OF-303).
 */
export const RULES_BEGIN_MARKER = "// BEGIN cms";
export const RULES_END_MARKER = "// END cms";

export const FIRESTORE_RULES_BLOCK = `function cmsIsOwner() {
  return request.auth != null && request.auth.token.get('cms_owner', false) == true;
}
match /cms_site/{docId} {
  allow read, write: if cmsIsOwner();
}
match /cms_pages/{pageId} {
  allow read, delete: if cmsIsOwner();
  allow create, update: if cmsIsOwner()
    && request.resource.data.keys().hasAll(['slug', 'title', 'status'])
    && request.resource.data.slug is string
    && request.resource.data.title is string
    && request.resource.data.status in ['draft', 'published'];
}
match /cms_page_content/{pageId} {
  allow read, delete: if cmsIsOwner();
  allow create, update: if cmsIsOwner() && request.resource.data.data is map;
}
match /cms_media/{mediaId} {
  allow read, write: if cmsIsOwner();
}
match /cms_releases/{releaseId} {
  allow read: if cmsIsOwner();
  allow write: if false;
}
match /cms_system/{docId} {
  allow read, write: if false;
}
match /cms_agent_tokens/{tokenId} {
  allow read, delete: if cmsIsOwner();
  allow create, update: if false;
}
match /cms_agent_clients/{clientId} {
  allow read, write: if false;
}
match /cms_agent_requests/{requestId} {
  allow read, write: if false;
}
match /cms_agent_codes/{codeId} {
  allow read, write: if false;
}
match /cms_messages/{messageId} {
  allow read, delete: if cmsIsOwner();
  allow update: if cmsIsOwner()
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read', 'spam']);
  allow create: if false;
}
match /cms_rate_limits/{visitorId} {
  allow read, write: if false;
}`;

export const STORAGE_RULES_BLOCK = `function cmsIsOwner() {
  return request.auth != null && request.auth.token.get('cms_owner', false) == true;
}
match /cms/media/{fileName} {
  allow read: if true;
  allow create, update: if cmsIsOwner() && (
    (request.resource.size < 15 * 1024 * 1024
      && request.resource.contentType.matches('image/(png|jpeg|gif|webp|avif)|application/pdf'))
    || (request.resource.size < 100 * 1024 * 1024
      && request.resource.contentType.matches('video/(mp4|webm|quicktime)')));
  allow delete: if cmsIsOwner();
}
match /cms/media/optimized/{allPaths=**} {
  allow read: if true;
  allow write: if false;
}
match /cms/{allPaths=**} {
  allow read, write: if false;
}`;

function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

const MARKER_NOTE = " — ne pas modifier (norme OFS, règle OF-303)";

export const FIRESTORE_RULES_FILE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    ${RULES_BEGIN_MARKER}${MARKER_NOTE}
${indent(FIRESTORE_RULES_BLOCK, 4)}
    ${RULES_END_MARKER}

    // Ajoutez ici les règles propres à votre site.
  }
}
`;

export const STORAGE_RULES_FILE = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    ${RULES_BEGIN_MARKER}${MARKER_NOTE}
${indent(STORAGE_RULES_BLOCK, 4)}
    ${RULES_END_MARKER}

    // Ajoutez ici les règles propres à votre site.
  }
}
`;

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Extracts the OpenFlow block of a rules file and compares it to the canonical one.
 * Returns `missing` when the markers are absent and `modified` when the content differs.
 */
export function compareRulesBlock(
  fileContent: string,
  canonicalBlock: string,
): "ok" | "missing" | "modified" {
  const begin = fileContent.indexOf(RULES_BEGIN_MARKER);
  const end = fileContent.indexOf(RULES_END_MARKER);
  if (begin === -1 || end === -1 || end < begin) return "missing";
  const afterMarkerLine = fileContent.indexOf("\n", begin);
  const block = fileContent.slice(afterMarkerLine + 1, end);
  return normalize(block) === normalize(canonicalBlock) ? "ok" : "modified";
}
