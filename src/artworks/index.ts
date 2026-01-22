export interface ArtworkMeta {
  title: string;
  description: string;
  date: string;
}

export interface Artwork {
  slug: string;
  meta: ArtworkMeta;
}

// 아트워크 목록을 가져오는 함수
export async function getArtworks(): Promise<Artwork[]> {
  const artworkModules = import.meta.glob('./*/meta.json', { eager: true });

  const artworks: Artwork[] = [];

  for (const path in artworkModules) {
    const slug = path.replace('./', '').replace('/meta.json', '');
    const meta = artworkModules[path] as ArtworkMeta;
    artworks.push({ slug, meta });
  }

  // 날짜 기준 내림차순 정렬
  artworks.sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime());

  return artworks;
}
