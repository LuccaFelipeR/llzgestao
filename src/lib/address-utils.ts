// Address format: P01002003001A
// P + 2 digits (Rua) + 3 digits (Posição) + 3 digits (Andar) + 3 digits (Lado) + 1 letter (Face)

const ADDRESS_REGEX = /^P(\d{2})(\d{3})(\d{3})(\d{3})([A-Z])$/;

export function validateAddressCode(code: string): boolean {
  return ADDRESS_REGEX.test(code.toUpperCase());
}

export function parseAddressCode(code: string) {
  const match = code.toUpperCase().match(ADDRESS_REGEX);
  if (!match) return null;
  return {
    rua: match[1],
    posicao: match[2],
    andar: match[3],
    lado: match[4],
    face: match[5],
  };
}

export function formatAddressDisplay(code: string): string {
  const parsed = parseAddressCode(code);
  if (!parsed) return code;
  return `P${parsed.rua} ${parsed.posicao} ${parsed.andar} ${parsed.lado} ${parsed.face}`;
}
