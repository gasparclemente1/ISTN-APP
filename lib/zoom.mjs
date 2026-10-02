import { createHmac } from 'node:crypto';

export const ZOOM_SDK_VERSION = '6.5.0';
export const meetingNumber = (value) => String(value || '').replace(/[\s-]/g, '');

export function zoomConfig(env = process.env) {
  return {
    clientId: (env.ZOOM_CLIENT_ID || '').trim(),
    clientSecret: (env.ZOOM_CLIENT_SECRET || '').trim(),
    allowedMeetings: (env.ZOOM_MEETING_IDS || '').split(',').map(meetingNumber).filter((id) => /^\d{9,11}$/.test(id))
  };
}

export function canEmbedMeeting(room, config) {
  const number = meetingNumber(room?.zoom_meeting_id);
  return Boolean(config.clientId && config.clientSecret && /^\d{9,11}$/.test(number) && config.allowedMeetings.includes(number));
}

// Only active, published rooms explicitly enabled by the operator can receive
// an attendee signature. Never accept a Zoom number or a host role from a client.
export function zoomRoom(meetings, id, config) {
  const room = meetings.find((item) => String(item.id) === id);
  if (!room) throw Object.assign(new Error('Esta reunião já não está disponível.'), { status: 404 });
  if (!canEmbedMeeting(room, config)) throw Object.assign(new Error('A participação dentro da App ainda não está ativa nesta reunião. Pode entrar pelo Zoom.'), { status: 503 });
  return room;
}

export function attendeeSignature(room, config, now = Date.now()) {
  if (!canEmbedMeeting(room, config)) throw new Error('Reunião não autorizada.');
  const iat = Math.floor(now / 1000) - 30;
  const exp = iat + 60 * 60;
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const content = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ appKey: config.clientId, mn: meetingNumber(room.zoom_meeting_id), role: 0, iat, exp, tokenExp: exp })}`;
  return `${content}.${createHmac('sha256', config.clientSecret).update(content).digest('base64url')}`;
}

export function isSameOrigin(request) {
  try {
    const origin = new URL(request.headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host
      && !['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']);
  } catch { return false; }
}
