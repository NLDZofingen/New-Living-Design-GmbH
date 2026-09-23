import { bathPackages } from '../../src/config/business.js';
import { optionsForPackage, type AccentPlacementId, type RoomType } from '../../src/data/badplaner.js';

/** A client selection error; the HTTP handler maps it to a field-specific 400. */
export class ValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const PLACEMENT_ALIAS: Readonly<Record<string, AccentPlacementId>> = {
  waschtisch: 'waschtischwand',
  waschtischwand: 'waschtischwand',
  dusche: 'duschnische',
  duschnische: 'duschnische',
};

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new ValidationError(field, 'Bitte eine gültige Auswahl angeben.');
  }
  return value.trim();
}

/** Empty fields are not selections; two different explicit IDs are a conflict. */
function aliasedField(body: Record<string, unknown>, field: string, legacy?: string, lowerCase = false): string {
  const normalize = (value: string) => lowerCase ? value.toLowerCase() : value;
  const current = normalize(stringField(body, field));
  const old = legacy ? normalize(stringField(body, legacy)) : '';
  if (current && old && current !== old) {
    throw new ValidationError(field, `Die Angaben für ${field} und ${legacy} widersprechen sich.`);
  }
  return current || old;
}

function requireOption<T extends { id: string }>(list: T[], id: string, field: string): T {
  if (!id) throw new ValidationError(field, 'Bitte eine Auswahl treffen.');
  const option = list.find((entry) => entry.id === id);
  if (!option) {
    throw new ValidationError(field, 'Diese Auswahl ist für das gewählte Paket nicht verfügbar.');
  }
  return option;
}

function requireEmpty(id: string, field: string): undefined {
  if (id) throw new ValidationError(field, 'Dieses Feld ist für diese Auswahl nicht konfigurierbar.');
  return undefined;
}

/**
 * Resolves only explicitly selected, package-allowed equipment. The UI already
 * sends its preselected IDs. The only derived values are its documented empty
 * Atelier format, fixed chrome for Essenza and an optional floor format.
 * This is pure validation: no requests, counters, price changes or prompt edits.
 */
export function normalizeSelection(body: Record<string, unknown>) {
  const roomId = aliasedField(body, 'raum', 'room', true);
  if (roomId !== 'badezimmer' && roomId !== 'gaeste-wc') {
    throw new ValidationError('raum', 'Bitte Badezimmer oder Gäste-WC wählen.');
  }
  const room = roomId as RoomType;
  const cisternId = stringField(body, 'cistern').toLowerCase();
  if (cisternId !== 'aufputz' && cisternId !== 'unterputz') {
    throw new ValidationError('cistern', 'Bitte angeben, ob der Spülkasten sichtbar oder in der Wand ist.');
  }
  const cistern = cisternId as 'aufputz' | 'unterputz';
  const isGuestWc = room === 'gaeste-wc';
  const packageId = aliasedField(body, 'paket', 'package', true);
  const pkg = requireOption(bathPackages, packageId, 'paket');
  const opts = optionsForPackage(pkg.id);
  const isAtelier = pkg.id === 'atelier';
  if (body.individuell !== undefined && typeof body.individuell !== 'boolean') {
    throw new ValidationError('individuell', 'Bitte eine gültige Angabe machen.');
  }
  const individuell = body.individuell === true;

  const tile = requireOption(opts.tiles, aliasedField(body, 'platte', 'tile'), 'platte');
  const floorId = stringField(body, 'boden');
  const floorTile = floorId ? requireOption(opts.tiles, floorId, 'boden') : undefined;
  const base = requireOption(opts.bases, aliasedField(body, 'unterbau', 'furniture'), 'unterbau');
  const top = requireOption(opts.tops, stringField(body, 'top'), 'top');
  const basinTypeId = stringField(body, 'becken');
  const basinType = opts.basinTypes.length
    ? requireOption(opts.basinTypes, basinTypeId, 'becken')
    : requireEmpty(basinTypeId, 'becken');
  const tapSeriesId = stringField(body, 'armaturenserie');
  const tapSeriesOption = pkg.id === 'colore'
    ? requireOption(opts.tapSeriesOptions, tapSeriesId, 'armaturenserie')
    : requireEmpty(tapSeriesId, 'armaturenserie');

  const finishId = stringField(body, 'finish');
  if (pkg.id === 'essenza' && finishId && finishId !== 'treemme-cromo') {
    throw new ValidationError('finish', 'Die Armaturen-Oberfläche ist in diesem Paket fest auf Chrom gesetzt.');
  }
  const finish = requireOption(opts.finishes, pkg.id === 'essenza' ? 'treemme-cromo' : finishId, 'finish');
  const sanitary = requireOption(opts.sanitary, aliasedField(body, 'keramik', 'sanitary'), 'keramik');
  const wall = requireOption(opts.walls, stringField(body, 'wall'), 'wall');
  const showerId = aliasedField(body, 'dusche', 'shower');
  const bathtubId = aliasedField(body, 'badewanne', 'bathtub');
  const shower = isGuestWc
    ? requireEmpty(showerId, 'dusche')
    : requireOption(opts.showers, showerId === 'gefaelle' ? 'walk-in' : showerId, 'dusche');
  const bathtub = isGuestWc
    ? requireEmpty(bathtubId, 'badewanne')
    : requireOption(opts.bathtubs, bathtubId, 'badewanne');
  const basin = requireOption(opts.basins, aliasedField(body, 'waschtisch', 'basin'), 'waschtisch');
  if (isGuestWc && basin.id !== 'einzel') {
    throw new ValidationError('waschtisch', 'Im Gäste-WC ist nur ein Einzelwaschtisch verfügbar.');
  }
  const mirror = requireOption(opts.mirrors, aliasedField(body, 'spiegel', 'mirror'), 'spiegel');

  const lookId = stringField(body, 'look');
  const look = isAtelier ? requireOption(opts.looks, lookId, 'look') : requireEmpty(lookId, 'look');
  if (isAtelier && look?.id !== tile.look) {
    throw new ValidationError('look', 'Der Look passt nicht zur gewählten Platte.');
  }

  const wantedFormat = stringField(body, 'format');
  if (!isAtelier && !wantedFormat) throw new ValidationError('format', 'Bitte ein Plattenformat wählen.');
  const format = wantedFormat || tile.format;
  if ((!isAtelier && !opts.formats.includes(format)) ||
      (format !== tile.format && !tile.formats.includes(format))) {
    throw new ValidationError('format', 'Das Format passt nicht zum Paket oder zur gewählten Platte.');
  }
  // Preserve the existing floor rule: matching selected format, otherwise its
  // own documented standard format. The floor ID itself is never substituted.
  const floorFormat = floorTile ? (floorTile.formats.includes(format) ? format : floorTile.format) : '';

  const accentModeId = stringField(body, 'kombination');
  const accentMode = isAtelier
    ? requireOption(opts.accentModes, accentModeId, 'kombination')
    : requireEmpty(accentModeId, 'kombination');
  const isKombi = isAtelier && accentMode?.id === 'kombination';
  const rawPlacement = stringField(body, 'akzentFlaeche').toLowerCase();
  const accentId = stringField(body, 'akzent');
  let placement: (typeof opts.accentPlacements)[number] | undefined;
  let accent: (typeof opts.accents)[number] | undefined;
  if (isKombi) {
    // Own-property lookup also rejects inherited keys such as "constructor".
    const placementId = Object.prototype.hasOwnProperty.call(PLACEMENT_ALIAS, rawPlacement)
      ? PLACEMENT_ALIAS[rawPlacement]
      : undefined;
    if (!placementId) throw new ValidationError('akzentFlaeche', 'Bitte eine gültige Akzentfläche wählen.');
    if (isGuestWc && placementId === 'duschnische') {
      throw new ValidationError('akzentFlaeche', 'Im Gäste-WC ist keine Duschnische verfügbar.');
    }
    placement = requireOption(opts.accentPlacements, placementId, 'akzentFlaeche');
    const allowedAccents = opts.accents.filter((entry) => entry.placement.includes(placementId));
    accent = requireOption(allowedAccents, accentId, 'akzent');
  } else {
    requireEmpty(rawPlacement, 'akzentFlaeche');
    requireEmpty(accentId, 'akzent');
  }

  const requiresQuote = isGuestWc || (!!shower && !!bathtub && (shower.id === 'keine') === (bathtub.id === 'keine'));

  return {
    room, isGuestWc, cistern, pkg, opts, isAtelier, individuell, tile, floorTile, base, top, basinType,
    tapSeriesOption, finish, sanitary, wall, shower, bathtub, basin, mirror, look, format,
    floorFormat, accentMode, isKombi, placement, accent,
    requiresQuote,
  };
}
