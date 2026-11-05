/**
 * Who lobbies for whom, and who among them held a government or Bundestag function — built from
 * the register's "Auftragsangaben" and person data into one lookup per organisation.
 *
 * Each mandate appears from both sides: on the agency's page as a client, and on the client's page
 * as a hired agency. The amount is the bracket the agency declares having received from that client;
 * when only the client names the agency (and the agency declares no matching contract) the amount
 * is unknown and left null rather than guessed.
 */

const byAmountDesc = (a, b) => (b.euro?.to ?? -1) - (a.euro?.to ?? -1) || a.name.localeCompare(b.name, 'de');

export function buildMandates(register, hasPage = () => true) {
  const nameById = new Map(register.map((o) => [o.id, o.name.trim()]));
  // Only organisations with a page on the site are linked; the rest keep their name, without an id.
  const link = (id) => (id && hasPage(id) ? id : null);
  const out = new Map();
  const entry = (id) => {
    if (!out.has(id)) out.set(id, { formerOfficials: [], clients: [], agencies: [], privateClientCount: 0 });
    return out.get(id);
  };

  for (const o of register) {
    if (o.formerOfficials?.length) entry(o.id).formerOfficials = o.formerOfficials;
    for (const c of o.contracts ?? []) {
      if (c.clientPersonCount) entry(o.id).privateClientCount += c.clientPersonCount;
      for (const client of c.clients) {
        const name = (client.id && nameById.get(client.id)) || client.name;
        if (!name) continue;
        entry(o.id).clients.push({ id: link(client.id), name, euro: client.euro, projects: c.projects, formerOfficials: c.formerOfficials });
        if (client.id) entry(client.id).agencies.push({ id: link(o.id), name: o.name.trim(), euro: client.euro, projects: c.projects, formerOfficials: c.formerOfficials });
      }
    }
  }
  // Agencies an organisation names itself but which do not list it as a client: shown without an amount.
  for (const o of register) {
    for (const c of o.contracts ?? []) {
      for (const a of c.agencies) {
        const name = (a.id && nameById.get(a.id)) || a.name;
        if (!name) continue;
        const known = entry(o.id).agencies.some((x) => (a.id && x.id === link(a.id) && x.id) || x.name === name);
        if (!known) entry(o.id).agencies.push({ id: link(a.id), name, euro: null, projects: c.projects, formerOfficials: c.formerOfficials });
      }
    }
  }

  const orgs = {};
  for (const [id, e] of out) {
    if (!hasPage(id)) continue;
    if (!e.formerOfficials.length && !e.clients.length && !e.agencies.length && !e.privateClientCount) continue;
    e.clients.sort(byAmountDesc);
    e.agencies.sort(byAmountDesc);
    orgs[id] = e;
  }
  return orgs;
}
