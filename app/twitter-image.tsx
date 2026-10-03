import {
  renderShareCard,
  SHARE_CARD_ALT,
  SHARE_CARD_SIZE,
} from "@/lib/share-card";

// Link-preview image (X card).
export const alt = SHARE_CARD_ALT;
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderShareCard();
}
