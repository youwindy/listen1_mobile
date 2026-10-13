#!/usr/bin/env node
/**
 * Patch react-native-track-player 4.1.2 for React Native 0.87.
 *
 * Runs automatically after `pnpm install` (see the "postinstall" script in
 * package.json). Two fixes are applied to MusicModule.kt:
 *
 *  1. `Track.originalItem` is a nullable `Bundle`, while RN 0.87's
 *     `Arguments.fromBundle` requires a non-null one, so the Android build
 *     fails with "Argument type mismatch: actual type is 'Bundle?', but
 *     'Bundle' was expected".
 *
 *  2. Every `@ReactMethod` is written as an expression-bodied coroutine launch:
 *         fun getPosition(callback: Promise) = scope.launch { … }
 *     which returns `kotlinx.coroutines.Job`, so the compiled JVM signature
 *     returns Object. React Native's TurboModule interop assumes
 *     "returnType == void iff the method is synchronous" and aborts at startup:
 *         TurboModuleInteropUtils$ParsingException: Unable to parse
 *         @ReactMethod annotations from native module: TrackPlayerModule.
 *     A bare `: Unit =` does not compile ("Return type mismatch: expected
 *     'Unit', actual 'Job'"), so each function becomes a block body, which
 *     discards the Job while keeping the same MainScope dispatch.
 *
 * The script is idempotent and matches on content rather than line numbers, so
 * it keeps working if the package is re-published with unrelated edits. Set
 * SKIP_TRACK_PLAYER_PATCH=1 to skip it. Remove it once upstream ships a release
 * that builds and runs against RN 0.87.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TARGET = path.join(
  'node_modules',
  'react-native-track-player',
  'android',
  'src',
  'main',
  'java',
  'com',
  'doublesymmetry',
  'trackplayer',
  'module',
  'MusicModule.kt'
);

function log(message) {
  console.log(`[patch-track-player] ${message}`);
}

if (process.env.SKIP_TRACK_PLAYER_PATCH === '1') {
  log('skipped (SKIP_TRACK_PLAYER_PATCH=1)');
  process.exit(0);
}

if (!existsSync(TARGET)) {
  // Nothing to do: the dependency is not installed (e.g. a docs-only checkout).
  log('react-native-track-player not installed, nothing to patch');
  process.exit(0);
}

const original = readFileSync(TARGET, 'utf8');
const usesCrlf = original.includes('\r\n');
const source = original.replace(/\r\n/g, '\n');

let patched = source;
const applied = [];

// ---------------------------------------------------------------- fix 1: Bundle
const bundleBefore = patched;
patched = patched
  .replace(
    'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
    'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem ?: Bundle()))'
  )
  .replace(
    'else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n            )',
    'else Arguments.fromBundle(\n                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle()\n            )'
  );
if (patched !== bundleBefore) applied.push('nullable Bundle');
else if (bundleBefore.includes('originalItem ?: Bundle()')) applied.push('nullable Bundle (already applied)');

// ------------------------------------------------ fix 2: void JVM signatures
const lines = patched.split('\n');

// Declaration shapes seen in the file:
//   a) fun name(…) = scope.launch {          (launch on the same line)
//   b) fun name(…) =                          (launch on the next line)
//        scope.launch {
//   c) fun name(…) { … }                      (already a block: leave alone)
const INLINE = /^(\s*)(.*\))\s*=\s*scope\.launch\s*\{\s*$/;
const DANGLING = /^(\s*)(.*\))\s*=\s*$/;
const LAUNCH_LINE = /^\s*scope\.launch\s*\{\s*$/;

let conversions = 0;
for (let i = 0; i < lines.length; i += 1) {
  if (!lines[i].includes('@ReactMethod')) continue;

  // The `fun` declaration follows the annotation, occasionally with blank lines
  // or an annotation argument in between, so scan forward until either the
  // declaration or the next annotation.
  let decl = -1;
  for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
    if (lines[j].includes('@ReactMethod')) break;
    if (/^\s*fun\s/.test(lines[j])) {
      decl = j;
      break;
    }
  }
  if (decl === -1) continue;

  const inline = INLINE.exec(lines[decl]);
  const dangling = inline ? null : DANGLING.exec(lines[decl]);

  let indent;
  let launchLine;

  if (inline) {
    indent = inline[1];
    launchLine = decl + 1;
    lines[decl] = `${indent}${inline[2]}: Unit {`;
    lines.splice(launchLine, 0, `${indent}    scope.launch {`);
  } else if (dangling && LAUNCH_LINE.test(lines[decl + 1] ?? '')) {
    indent = dangling[1];
    // The launch block already exists on the next line; re-indent it instead of
    // inserting a second one.
    launchLine = decl + 1;
    lines[decl] = `${indent}${dangling[2]}: Unit {`;
    lines[launchLine] = `${indent}    scope.launch {`;
  } else {
    continue;
  }

  // The original `}` closing `scope.launch {` sits at the function's own indent
  // and, in the expression form, closed the function too. As a block body it
  // only closes the lambda, so the function needs its own closing brace.
  const closing = `${indent}}`;
  let cursor = launchLine + 1;
  for (; cursor < lines.length; cursor += 1) {
    if (lines[cursor].replace(/\s+$/, '') === closing) break;
  }
  if (cursor >= lines.length) {
    throw new Error(`[patch-track-player] unbalanced braces near: ${lines[decl].trim()}`);
  }

  lines.splice(cursor + 1, 0, closing);
  conversions += 1;
  i = cursor + 1;
}

patched = lines.join('\n');
if (conversions > 0) applied.push(`${conversions} async @ReactMethod signatures`);

// ------------------------------------------------------------------- write out
if (patched === source) {
  log('already patched, nothing to do');
  process.exit(0);
}

// A brace imbalance would mean the transformation misfired; fail loudly instead
// of leaving a broken native module behind.
const opens = (patched.match(/\{/g) ?? []).length;
const closes = (patched.match(/\}/g) ?? []).length;
if (opens !== closes) {
  throw new Error(`[patch-track-player] refusing to write unbalanced output ({=${opens}, }=${closes})`);
}

writeFileSync(TARGET, usesCrlf ? patched.replace(/\n/g, '\r\n') : patched);
log(`patched ${TARGET}`);
for (const item of applied) log(`  - ${item}`);
