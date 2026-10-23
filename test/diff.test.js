import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedContent, applyHunks, formatHunk, parseDiff, removedContent } from '../src/lib/diff.js';

// Shaped like rn-diff-purge's output (`git diff` between two template versions).
const DIFF = `diff --git a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar
index 8bdaf60c75ab801e22807dde59e12a8735a34077..61285a659d17295f1de7c53e24fdf13ad755c379 100644
GIT binary patch
delta 36855
zcmXVWV|bkZ_jDR#W81c!G\`4NqPNQwKF*ml&#<uOo+1O5#wn_W%_xC(6KJV}Anz_%+
--- not a header, still binary data

diff --git a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
index 2a84e188b8..37f78a6af8 100644
--- a/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
+++ b/RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties
@@ -1,6 +1,6 @@
 distributionBase=GRADLE_USER_HOME
 distributionPath=wrapper/dists
-distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip
+distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip
 networkTimeout=10000
 validateDistributionUrl=true
 zipStoreBase=GRADLE_USER_HOME
diff --git a/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift b/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift
new file mode 100644
index 0000000000..ab19528eac
--- /dev/null
+++ b/RnDiffApp/ios/RnDiffApp/SceneDelegate.swift
@@ -0,0 +1,3 @@
+import UIKit
+
+class SceneDelegate: UIResponder, UIWindowSceneDelegate {}
diff --git a/RnDiffApp/.buckconfig b/RnDiffApp/.buckconfig
deleted file mode 100644
index 934256cb29..0000000000
--- a/RnDiffApp/.buckconfig
+++ /dev/null
@@ -1,2 +0,0 @@
-[android]
-  target = Google Inc.:Google APIs:23
\\ No newline at end of file
diff --git a/RnDiffApp/android/old.txt b/RnDiffApp/android/new.txt
similarity index 90%
rename from RnDiffApp/android/old.txt
rename to RnDiffApp/android/new.txt
index 1111111..2222222 100644
--- a/RnDiffApp/android/old.txt
+++ b/RnDiffApp/android/new.txt
@@ -1,2 +1,2 @@
 keep
-old
+new
diff --git a/RnDiffApp/android/gradlew b/RnDiffApp/android/gradlew
old mode 100644
new mode 100755
diff --git a/RnDiffApp/package.json b/RnDiffApp/package.json
index 86b03b9769..f60860f91a 100644
--- a/RnDiffApp/package.json
+++ b/RnDiffApp/package.json
@@ -1,5 +1,5 @@
 {
   "engines": {
-    "node": ">=20"
+    "node": ">= 22.11.0"
   }
 }
\\ No newline at end of file
`;

test('parseDiff reads every file of a multi-file diff', () => {
  const files = parseDiff(DIFF);
  assert.deepEqual(
    files.map((file) => [file.status, file.oldPath, file.newPath, file.binary]),
    [
      ['modified', 'RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar', 'RnDiffApp/android/gradle/wrapper/gradle-wrapper.jar', true],
      ['modified', 'RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties', 'RnDiffApp/android/gradle/wrapper/gradle-wrapper.properties', false],
      ['added', null, 'RnDiffApp/ios/RnDiffApp/SceneDelegate.swift', false],
      ['deleted', 'RnDiffApp/.buckconfig', null, false],
      ['renamed', 'RnDiffApp/android/old.txt', 'RnDiffApp/android/new.txt', false],
      ['modified', 'RnDiffApp/android/gradlew', 'RnDiffApp/android/gradlew', false],
      ['modified', 'RnDiffApp/package.json', 'RnDiffApp/package.json', false],
    ],
  );
  assert.equal(files[0].hunks.length, 0);
  assert.equal(files[2].mode, '100644');
  assert.equal(files[5].mode, '100755');
});

test('parseDiff reads hunk ranges, line types and "No newline at end of file"', () => {
  const [, properties, , deleted, , , pkg] = parseDiff(DIFF);
  const hunk = properties.hunks[0];
  assert.deepEqual([hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines], [1, 6, 1, 6]);
  assert.deepEqual(hunk.lines.map((line) => line.type).join(''), '  -+   ');
  assert.equal(deleted.hunks[0].lines.at(-1).noNewline, true);
  assert.equal(pkg.hunks[0].lines.at(-1).text, '}');
  assert.equal(pkg.hunks[0].lines.at(-1).noNewline, true);
});

test('a removed line that looks like a header stays part of the hunk', () => {
  const [file] = parseDiff(`diff --git a/x.txt b/x.txt
--- a/x.txt
+++ b/x.txt
@@ -1,2 +1,1 @@
--- a/comment
 keep
`);
  assert.deepEqual(file.hunks[0].lines, [
    { type: '-', text: '-- a/comment' },
    { type: ' ', text: 'keep' },
  ]);
});

test('addedContent and removedContent rebuild whole files', () => {
  const [, , added, deleted] = parseDiff(DIFF);
  assert.equal(addedContent(added), 'import UIKit\n\nclass SceneDelegate: UIResponder, UIWindowSceneDelegate {}\n');
  assert.equal(removedContent(deleted), '[android]\n  target = Google Inc.:Google APIs:23');
});

const PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

test('applyHunks applies a hunk with exact context', () => {
  const [, properties] = parseDiff(DIFF);
  const result = applyHunks(PROPERTIES, properties.hunks);
  assert.deepEqual(result.failed, []);
  assert.equal(result.applied, 1);
  assert.equal(result.content, PROPERTIES.replace('9.0.0', '9.3.1'));
});

test('applyHunks finds a hunk that moved a few lines', () => {
  const [, properties] = parseDiff(DIFF);
  const moved = `# my comment\n# another one\n${PROPERTIES}`;
  const result = applyHunks(moved, properties.hunks);
  assert.deepEqual(result.failed, []);
  assert.equal(result.content, moved.replace('9.0.0', '9.3.1'));
});

test('applyHunks fails when the context was changed', () => {
  const [, properties] = parseDiff(DIFF);
  const changed = PROPERTIES.replace('networkTimeout=10000', 'networkTimeout=60000');
  const result = applyHunks(changed, properties.hunks);
  assert.deepEqual(result.failed, [0]);
});

test('applyHunks fails when the hunk moved too far', () => {
  const [, properties] = parseDiff(DIFF);
  const far = `${'#\n'.repeat(80)}${PROPERTIES}`;
  assert.deepEqual(applyHunks(far, properties.hunks, { maxOffset: 50 }).failed, [0]);
  assert.deepEqual(applyHunks(far, properties.hunks, { maxOffset: 100 }).failed, []);
});

test('applyHunks counts hunks that are already applied', () => {
  const [, properties] = parseDiff(DIFF);
  const result = applyHunks(PROPERTIES.replace('9.0.0', '9.3.1'), properties.hunks);
  assert.deepEqual(result.failed, []);
  assert.equal(result.applied, 0);
  assert.equal(result.already, 1);
});

test('applyHunks applies several hunks in order and keeps CRLF line endings', () => {
  const [file] = parseDiff(`diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@
 one
+one and a half
 two
 three
@@ -8,3 +9,3 @@
 eight
-nine
+NINE
 ten
`);
  const lines = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const result = applyHunks(`${lines.join('\r\n')}\r\n`, file.hunks);
  assert.deepEqual(result.failed, []);
  assert.equal(result.content, 'one\r\none and a half\r\ntwo\r\nthree\r\nfour\r\nfive\r\nsix\r\nseven\r\neight\r\nNINE\r\nten\r\n');
});

test('applyHunks follows "No newline at end of file"', () => {
  const [, , , , , , pkg] = parseDiff(DIFF);
  const before = '{\n  "engines": {\n    "node": ">=20"\n  }\n}';
  const result = applyHunks(before, pkg.hunks);
  assert.equal(result.content, '{\n  "engines": {\n    "node": ">= 22.11.0"\n  }\n}');

  const [file] = parseDiff(`diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1,2 +1,2 @@
 a
-b
\\ No newline at end of file
+b
`);
  assert.equal(applyHunks('a\nb', file.hunks).content, 'a\nb\n');
});

test('formatHunk prints a hunk back as diff lines', () => {
  const [, properties] = parseDiff(DIFF);
  const lines = formatHunk(properties.hunks[0]);
  assert.equal(lines[0], '@@ -1,6 +1,6 @@');
  assert.equal(lines[3], '-distributionUrl=https\\://services.gradle.org/distributions/gradle-9.0.0-bin.zip');
});
