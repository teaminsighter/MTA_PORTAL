/*
 * Property hero photo picker.
 *
 * Bundled NZ residential photos rotated deterministically by lead id
 * so the same address always shows the same picture — matches the
 * "your property" mental model when a vendor reopens the report or a
 * consultant flips between the inbox preview and the workspace.
 *
 * To add more photos: drop the file under public/property-photos/ and
 * extend HERO_PHOTOS. The picker handles any pool size.
 */
export const HERO_PHOTOS = [
  "/property-photos/waterfront-sunset.jpg",
  "/property-photos/white-bungalow-boat.jpg",
  "/property-photos/modern-grey.jpg",
  "/property-photos/waterfront-estate.jpg",
  "/property-photos/plaster-bungalow.jpg",
] as const;

export function pickHeroPhoto(leadId: string): string {
  let hash = 0;
  for (let i = 0; i < leadId.length; i++) {
    hash = (hash * 31 + leadId.charCodeAt(i)) | 0;
  }
  return HERO_PHOTOS[Math.abs(hash) % HERO_PHOTOS.length];
}
