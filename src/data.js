export const APP_CONFIG = {
  sources: [
    { id: 'streams', title: 'Cultos de sábado e domingo', platform: 'YouTube', url: 'https://www.youtube.com/@apostolomarcelino/streams', channelId: 'UCEBWBoys57eU9sPUONUENFQ', feedUrl: 'https://www.youtube.com/@apostolomarcelino/streams', image: '/design/assets/ministry-art-01.jpeg', type: 'Cultos', description: 'Acompanhe os cultos de sábado e domingo com o Profeta Elias.' },
    { id: 'zoom-recordings', title: 'Lives Zoom gravadas', platform: 'YouTube', url: 'https://www.youtube.com/@LorenaLopes56/videos', channelId: 'UCbc9yF0Dr3rWDmkfsAq3Ntg', feedUrl: 'https://www.youtube.com/@LorenaLopes56/videos', image: '/design/assets/ministry-art-02.jpeg', type: 'Gravações', description: 'Canal que publica as gravações das lives Zoom.' }
  ]
};

export const countryNames = {
  AO: 'Angola', BR: 'Brasil', CD: 'Congo', DE: 'Alemanha', ES: 'Espanha', FR: 'França', MZ: 'Moçambique', PT: 'Portugal', ST: 'São Tomé e Príncipe'
};

export async function loadDirectory() {
  const [physical, online] = await Promise.all([
    fetch('/data/church-service-source-records.json').then((response) => response.json()),
    fetch('/data/online-communities-source-records.json').then((response) => response.json())
  ]);
  return { physical, online };
}

export async function loadLatestVideos(channelId) {
  const response = await fetch(`/api/latest-videos?channel=${encodeURIComponent(channelId)}`);
  if (!response.ok) throw new Error('Não foi possível atualizar os vídeos.');
  return response.json();
}

export async function loadLiveConfig() {
  const response = await fetch('/data/live-config.json');
  if (!response.ok) throw new Error('Não foi possível carregar a programação das reuniões.');
  return response.json();
}

export async function loadTeachingLibrary() {
  const response = await fetch('/data/youtube-teachings.json');
  if (!response.ok) throw new Error('Não foi possível carregar o acervo de ensinos.');
  return response.json();
}

export function toWhatsApp(phone) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
