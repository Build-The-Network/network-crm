'use strict';

// Notion API wrapper.
// Reads NOTION_TOKEN and NOTION_DB_ID from environment (loaded by server.js
// via dotenv before any require of this module).
//
// Rate limit: Notion enforces ~3 req/s. All exported functions are simple
// async wrappers — callers are responsible for not hammering in tight loops.

const { Client } = require('@notionhq/client');
const logger = require('./logger');

let _client = null;
let _dbId = null;

function client() {
  if (!_client) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error('NOTION_TOKEN is not set');
    _client = new Client({ auth: token });
  }
  return _client;
}

function dbId() {
  if (!_dbId) {
    _dbId = process.env.NOTION_DB_ID;
    if (!_dbId) throw new Error('NOTION_DB_ID is not set');
  }
  return _dbId;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Run a paginated query against the Contacts database. */
async function query(filter, sorts) {
  const pages = [];
  let cursor;
  do {
    const res = await client().databases.query({
      database_id: dbId(),
      ...(filter ? { filter } : {}),
      ...(sorts  ? { sorts }  : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

/** Patch a page's properties. */
async function patch(pageId, properties) {
  return client().pages.update({ page_id: pageId, properties });
}

/** Create a new page in the Contacts database. */
async function create(properties) {
  return client().pages.create({
    parent: { database_id: dbId() },
    properties,
  });
}

// ─── Property extractors ──────────────────────────────────────────────────────

function getText(page, name) {
  const p = page.properties[name];
  if (!p) return '';
  if (p.type === 'title')        return p.title.map(t => t.plain_text).join('');
  if (p.type === 'rich_text')    return p.rich_text.map(t => t.plain_text).join('');
  if (p.type === 'select')       return p.select?.name ?? '';
  if (p.type === 'status')       return p.status?.name ?? '';  // Notion native status type
  if (p.type === 'email')        return p.email ?? '';
  if (p.type === 'url')          return p.url ?? '';
  if (p.type === 'phone_number') return p.phone_number ?? '';
  return '';
}

function getCheckbox(page, name) {
  const p = page.properties[name];
  if (!p || p.type !== 'checkbox') return false;
  return p.checkbox === true;
}

function getDate(page, name) {
  const p = page.properties[name];
  if (!p || p.type !== 'date') return null;
  return p.date?.start ?? null;
}

function getNumber(page, name) {
  const p = page.properties[name];
  if (!p || p.type !== 'number') return null;
  return p.number ?? null;
}

// ─── Property builders ────────────────────────────────────────────────────────

function selectProp(name)     { return { select: { name } }; }
function statusProp(name)     { return { status: { name } }; }  // for Notion's native status type
function textProp(content)    { return { rich_text: [{ text: { content } }] }; }
function urlProp(url)         { return { url }; }
function dateProp(iso)        { return { date: { start: iso } }; }
function checkboxProp(bool)   { return { checkbox: bool }; }

module.exports = {
  query,
  patch,
  create,
  getText,
  getCheckbox,
  getDate,
  getNumber,
  selectProp,
  statusProp,
  textProp,
  urlProp,
  dateProp,
  checkboxProp,
};
