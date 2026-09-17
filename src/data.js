export const APP_CONFIG = {
  sources: [
    { id: 'streams', title: 'Cultos de sábado e domingo', platform: 'YouTube', url: 'https://www.youtube.com/@apostolomarcelino/streams', channelId: 'UCEBWBoys57eU9sPUONUENFQ', feedUrl: 'https://www.youtube.com/@apostolomarcelino/streams', image: '/design/assets/ministry-art-01.jpeg', type: 'Cultos', description: 'Acompanhe os cultos de sábado e domingo com o Profeta Elias.' },
    { id: 'zoom-recordings', title: 'Lives Zoom gravadas', platform: 'YouTube', url: 'https://www.youtube.com/@LorenaLopes56/videos', channelId: 'UCbc9yF0Dr3rWDmkfsAq3Ntg', feedUrl: 'https://www.youtube.com/@LorenaLopes56/videos', image: '/design/assets/ministry-art-02.jpeg', type: 'Gravações', description: 'Canal que publica as gravações das lives Zoom.' }
  ]
};

// Read through the server, which asks Supabase and falls back to the
// announcement files when the database cannot be reached.
export async function loadDirectory() {
  const response = await fetch('/api/directory');
  if (!response.ok) throw new Error('Não foi possível carregar o diretório.');
  return response.json();
}

export async function loadLatestVideos(channelId) {
  const response = await fetch(`/api/latest-videos?channel=${encodeURIComponent(channelId)}`);
  if (!response.ok) throw new Error('Não foi possível atualizar os vídeos.');
  return response.json();
}

let configPromise = null;
export function backendConfig() {
  configPromise ||= fetch('/api/config').then((response) => response.json()).catch(() => ({ supabaseUrl: '', supabaseKey: '' }));
  return configPromise;
}

// No bundled fallback on purpose: a stale Zoom link would send people to a
// room that is not the meeting. The server says so with an error instead.
export async function loadMeetings() {
  const response = await fetch('/api/meetings');
  if (!response.ok) throw new Error('Não foi possível carregar as reuniões.');
  return (await response.json()).meetings;
}

export async function loadTeachingLibrary() {
  const response = await fetch('/data/youtube-teachings.json');
  if (!response.ok) throw new Error('Não foi possível carregar o acervo de ensinos.');
  return response.json();
}
