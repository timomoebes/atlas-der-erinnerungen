const ALLOWED = /^image\/(jpeg|png|webp)$/;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

// Resizes to at most 1600px on the long edge and returns a JPEG Blob (a few hundred KB).
// Re-encoding through a canvas also drops EXIF data such as GPS coordinates, which matters for family photos.
export async function resizeToBlob(file, maxEdge = 1600, quality = 0.82) {
  if (!ALLOWED.test(file.type)) throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Das Foto darf höchstens 20 MB groß sein.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Das Foto konnte nicht verarbeitet werden.');
  return blob;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}
