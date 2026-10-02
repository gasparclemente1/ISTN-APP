import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { attendeeSignature, canEmbedMeeting, isSameOrigin, zoomConfig, zoomRoom } from '../lib/zoom.mjs';
import { securityHeaders } from '../lib/security.mjs';
import { resolvePublicPath } from '../lib/static.mjs';

const config = zoomConfig({ ZOOM_CLIENT_ID: 'test-client', ZOOM_CLIENT_SECRET: 'test-secret', ZOOM_MEETING_IDS: '123 456 7890,987654321' });
const room = { id: 'published-room', zoom_meeting_id: '123 456 7890' };

test('Zoom só autoriza reuniões publicadas e explicitamente configuradas', () => {
  assert.equal(canEmbedMeeting(room, config), true);
  assert.equal(canEmbedMeeting(room, zoomConfig({})), false);
  assert.equal(canEmbedMeeting({ zoom_meeting_id: '999999999' }, config), false);
  assert.equal(canEmbedMeeting({ zoom_meeting_id: '1234567890<script>' }, config), false);
  assert.equal(zoomRoom([room], room.id, config), room);
  assert.throws(() => zoomRoom([room], '1234567890', config), { status: 404 });
  assert.throws(() => zoomRoom([room], room.id, zoomConfig({})), { status: 503 });
});

test('assinatura verificada por HMAC fixa participante, reunião e validade', () => {
  const now = 1800000000000;
  const token = attendeeSignature({ ...room, role: 1 }, config, now);
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.role, 0);
  assert.equal(claims.mn, '1234567890');
  assert.equal(claims.appKey, 'test-client');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.tokenExp, claims.exp);
  assert.ok(claims.exp > now / 1000 + 1800);
  assert.equal(signature, createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url'));
  assert.throws(() => attendeeSignature({ zoom_meeting_id: '999999999' }, config));
});

test('pedidos de entrada recusam origens externas ou ausentes', () => {
  const request = (origin, site = 'same-origin') => ({ headers: { host: 'app.example', origin, 'sec-fetch-site': site } });
  assert.equal(isSameOrigin(request('https://app.example')), true);
  assert.equal(isSameOrigin(request('https://other.example')), false);
  assert.equal(isSameOrigin(request('https://app.example', 'cross-site')), false);
  assert.equal(isSameOrigin(request(undefined)), false);
  assert.equal(isSameOrigin(request('null')), false);
});

test('só o documento da sala recebe permissões de câmara e SDK', () => {
  const normal = securityHeaders();
  const live = securityHeaders({ zoomRoom: true });
  assert.match(normal['Permissions-Policy'], /camera=\(\), microphone=\(\)/);
  assert.doesNotMatch(normal['Content-Security-Policy'], /source.zoom.us|unsafe-eval/);
  assert.match(live['Permissions-Policy'], /camera=\(self\), microphone=\(self\)/);
  assert.match(live['Content-Security-Policy'], /https:\/\/source.zoom.us/);
  assert.equal(resolvePublicPath('/srv/app', '/sala.html').path, '/srv/app/sala.html');
});
