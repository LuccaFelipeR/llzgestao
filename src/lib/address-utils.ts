// Address format: Any alphanumeric code with minimum 3 chars
// Segmented as: first char (prefix) + segments for Rua, Posição, Andar, Lado, Face
// Classic format: P01002003001A = P + 2 digits (Rua) + 3 digits (Posição) + 3 digits (Andar) + 3 digits (Lado) + 1 letter (Face)
// Flexible: accepts any code >= 3 chars

const CLASSIC_REGEX = /^([A-Z])(\d{2})(\d{3})(\d{3})(\d{3})([A-Z])$/;

export function validateAddressCode(code: string): boolean {
  const upper = code.toUpperCase().trim();
  // Accept classic format OR any alphanumeric code >= 3 chars
  return upper.length >= 3 && /^[A-Z0-9\-_.]+$/i.test(upper);
}

export function parseAddressCode(code: string) {
  const upper = code.toUpperCase().trim();
  const match = upper.match(CLASSIC_REGEX);
  if (match) {
    return {
      rua: match[2],
      posicao: match[3],
      andar: match[4],
      lado: match[5],
      face: match[6],
    };
  }
  // For non-classic codes, return the code itself as display
  return {
    rua: upper.slice(0, 2),
    posicao: upper.slice(2, 5) || "-",
    andar: upper.slice(5, 8) || "-",
    lado: upper.slice(8, 11) || "-",
    face: upper.slice(11, 12) || "-",
  };
}

export function formatAddressDisplay(code: string): string {
  const upper = code.toUpperCase().trim();
  const match = upper.match(CLASSIC_REGEX);
  if (match) {
    return `${match[1]}${match[2]} ${match[3]} ${match[4]} ${match[5]} ${match[6]}`;
  }
  return upper;
}
