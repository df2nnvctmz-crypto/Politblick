const nf = new Intl.NumberFormat("de-DE");

export const formatEUR = (n: number): string => `${nf.format(n)} €`;
export const formatInt = (n: number): string => nf.format(n);
