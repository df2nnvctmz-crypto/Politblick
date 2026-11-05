import { describe, expect, it } from 'vitest';
import { buildMandates } from './lib/lobby-mandates.mjs';

const official = (name) => ({ name, gov: { kind: 'FEDERAL_ADMINISTRATION', ended: true, endDate: '2025-05', role: null, position: 'Referent', authority: 'BMF' } });

describe('buildMandates', () => {
  const register = [
    {
      id: 'A1', name: 'Agentur ', formerOfficials: [],
      contracts: [
        { projects: ['Gesetz X'], clients: [{ id: 'C1', name: 'Kunde (Registername abweichend)', euro: { from: 50001, to: 100000 } }], clientPersonCount: 0, agencies: [], formerOfficials: [official('Eva Beispiel')] },
        { projects: [], clients: [{ id: null, name: 'Nicht registrierter Kunde', euro: { from: 1, to: 50000 } }], clientPersonCount: 2, agencies: [], formerOfficials: [] },
      ],
    },
    { id: 'C1', name: 'Kunde GmbH', formerOfficials: [official('Max Muster')], contracts: [{ projects: ['Gesetz Y'], clients: [], clientPersonCount: 0, agencies: [{ id: 'A1', name: 'Agentur' }, { id: null, name: 'Kanzlei ohne Eintrag' }], formerOfficials: [] }] },
    { id: 'Q1', name: 'Ohne alles', formerOfficials: [], contracts: [] },
  ];
  const orgs = buildMandates(register);

  it('shows a mandate on both sides, with the register name and the agency-declared amount', () => {
    expect(orgs.A1.clients[0]).toMatchObject({ id: 'C1', name: 'Kunde GmbH', euro: { from: 50001, to: 100000 } });
    expect(orgs.A1.clients[0].formerOfficials.map((p) => p.name)).toEqual(['Eva Beispiel']);
    expect(orgs.C1.agencies[0]).toMatchObject({ id: 'A1', name: 'Agentur', euro: { from: 50001, to: 100000 } });
  });

  it('adds an agency only the client names, without inventing an amount, and never twice', () => {
    expect(orgs.C1.agencies.map((a) => [a.name, a.euro])).toEqual([['Agentur', { from: 50001, to: 100000 }], ['Kanzlei ohne Eintrag', null]]);
  });

  it('keeps unregistered clients by name, counts private clients, and drops empty organisations', () => {
    expect(orgs.A1.clients.map((c) => c.name)).toEqual(['Kunde GmbH', 'Nicht registrierter Kunde']);
    expect(orgs.A1.privateClientCount).toBe(2);
    expect(orgs.C1.formerOfficials.map((p) => p.name)).toEqual(['Max Muster']);
    expect(orgs.Q1).toBeUndefined();
  });
});

describe('buildMandates with pages', () => {
  it('links only organisations that have a page, and drops entries for those without', () => {
    const register = [
      { id: 'A1', name: 'Agentur', formerOfficials: [], contracts: [{ projects: [], clients: [{ id: 'GONE', name: 'Gelöscht', euro: null }], clientPersonCount: 0, agencies: [], formerOfficials: [] }] },
      { id: 'GONE', name: 'Gelöschte Firma', formerOfficials: [], contracts: [] },
    ];
    const orgs = buildMandates(register, (id) => id === 'A1');
    expect(orgs.A1.clients[0]).toMatchObject({ id: null, name: 'Gelöschte Firma' });
    expect(orgs.GONE).toBeUndefined();
  });
});
