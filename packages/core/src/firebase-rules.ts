/**
 * Canonical OpenFlow security rules. Sites may add their own rules outside the
 * `// BEGIN openflow` / `// END openflow` markers; the block itself must stay identical (OF-303).
 */
export const RULES_BEGIN_MARKER = "// BEGIN openflow";
export const RULES_END_MARKER = "// END openflow";

export const FIRESTORE_RULES_BLOCK = `function ofIsOwner() {
  return request.auth != null && request.auth.token.get('of_owner', false) == true;
}
match /of_site/{docId} {
  allow read, write: if ofIsOwner();
}
match /of_pages/{pageId} {
  allow read, delete: if ofIsOwner();
  allow create, update: if ofIsOwner()
    && request.resource.data.keys().hasAll(['slug', 'title', 'status', 'data'])
    && request.resource.data.slug is string
    && request.resource.data.title is string
    && request.resource.data.status in ['draft', 'published'];
}
match /of_media/{mediaId} {
  allow read, write: if ofIsOwner();
}
match /of_releases/{releaseId} {
  allow read: if ofIsOwner();
  allow write: if false;
}
match /of_system/{docId} {
  allow read, write: if false;
}`;

export const STORAGE_RULES_BLOCK = `function ofIsOwner() {
  return request.auth != null && request.auth.token.get('of_owner', false) == true;
}
match /openflow/media/{fileName} {
  allow read: if true;
  allow create, update: if ofIsOwner()
    && request.resource.size < 15 * 1024 * 1024
    && request.resource.contentType.matches('image/(png|jpeg|gif|webp|avif)|video/(mp4|webm)|application/pdf');
  allow delete: if ofIsOwner();
}
match /openflow/{allPaths=**} {
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
