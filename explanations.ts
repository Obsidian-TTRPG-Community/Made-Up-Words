// Hardcoded explanations for common inflection labels.
//
// These show up as hover tooltips in the panel's word-details view and on
// inflected-form mentions in the dictionary tooltip. The goal is to teach
// the linguistic concept, not just the term — so each entry has an
// example to anchor it.
//
// Match is case-insensitive and ignores trailing dots/spaces, so "plural",
// "Plural", and "PLURAL" all resolve to the same explanation. Labels not
// found here fall back to whatever description the user set on the rule
// itself (if any), or no tooltip at all.

const EXPLANATIONS: Record<string, string> = {
  // === Nominal categories ===
  "plural":
    "More than one of something. English: cat → cats. Many languages also mark dual (exactly two) or paucal (a few) as separate categories.",
  "singular":
    "Exactly one of something. The default 'unmarked' form in many languages, but explicit in others.",
  "dual":
    "Exactly two of something. Found in Arabic, Slovene, and older Indo-European. Distinct from plural (3+).",

  // === Case markers ===
  "nominative":
    "The subject of a sentence — the doer of the action. 'The CAT slept.' In English this case is unmarked.",
  "accusative":
    "The direct object — what the action is done to. 'I saw the CAT.' Latin -m, German -n, Finnish -n.",
  "genitive":
    "Possession or 'of' relationships. 'the cat's tail' / 'the tail of the cat'. English uses 's, Latin uses -i/-ae/-is.",
  "dative":
    "The indirect object — usually the recipient. 'I gave the book to the CAT.' Often translated as 'to' or 'for'.",
  "locative":
    "Location — where something happens. 'in the house', 'at the river'. Finnish, Russian, Latin all have one.",
  "ablative":
    "Movement away from, or means by which. 'from the city', 'by sword'. Common in Latin.",
  "instrumental":
    "The tool used to do something. 'with a hammer', 'by train'. Found in Russian, Sanskrit, Finnish.",
  "vocative":
    "Direct address — calling out to someone. 'O Caesar!', 'Hey, John!' Marked in Latin, Greek, Czech.",
  "possessive":
    "Indicates ownership. English 's (the cat's bowl) or whose-form pronouns (my, your, their).",

  // === Verbal categories - tense ===
  "past":
    "An action that has already happened. English usually -ed (walked) or irregular (went, ate).",
  "present":
    "Happening now, or generally true. English often unmarked, but 3rd person singular takes -s (walks).",
  "future":
    "Will happen later. English uses 'will' as a separate word; other languages affix it (Spanish -ré).",
  "perfect":
    "A completed action with present relevance. 'I have eaten.' Distinct from simple past in many languages.",
  "imperfect":
    "Past action that was ongoing or habitual. 'I was walking' / 'I used to walk.' Important in Romance languages.",
  "pluperfect":
    "An action completed before another past action. 'I HAD eaten before you arrived.'",

  // === Verbal categories - aspect ===
  "present participle":
    "The -ing form. Used for ongoing action ('walking') or as an adjective ('the running water').",
  "past participle":
    "The -en/-ed form. Used in perfect tenses ('I have eaten') and as a passive adjective ('the eaten apple').",
  "gerund":
    "A verb form used as a noun. 'Swimming is fun.' Looks like -ing in English; distinct from participle in Latin.",
  "infinitive":
    "The base form of the verb, often with 'to'. 'I want TO RUN.' The dictionary lemma in many languages.",

  // === Verbal categories - voice and mood ===
  "passive":
    "The subject receives the action rather than doing it. 'The cat was seen' instead of 'I saw the cat'.",
  "subjunctive":
    "Used for hypotheticals, wishes, doubts. 'If I WERE rich...' Strong in Romance languages, weakening in English.",
  "imperative":
    "A command. 'Run!' Often a distinct verb form in inflected languages.",
  "causative":
    "Indicates causing someone else to do the action. 'Make her run' / 'have him fix it'. A whole verb form in Japanese/Turkish.",
  "negation":
    "Marks negative meaning. English 'un-' or 'not'; Finnish has a whole negation verb 'ei'.",

  // === Verbal categories - agreement ===
  "3rd sing.":
    "Third person singular — he/she/it. English marks this with -s on present-tense verbs (walks, runs).",
  "3rd singular":
    "Third person singular — he/she/it. English marks this with -s on present-tense verbs (walks, runs).",

  // === Derivational categories ===
  "agent":
    "A person or thing that performs the action. English -er (teacher, runner). Technically derivation, not inflection.",
  "comparative":
    "Indicates 'more' of a quality. English -er (taller). Some languages use a separate word ('more X').",
  "superlative":
    "Indicates 'most' of a quality. English -est (tallest). Sometimes formed with 'most' instead.",
  "diminutive":
    "Indicates smallness or affection. Spanish -ito (gatito = kitten), German -chen (Mädchen).",
  "augmentative":
    "Indicates largeness or intensity. Italian -one (libro → librone = big book). Opposite of diminutive.",
  "adverb":
    "Turns an adjective into an adverb. English -ly (quick → quickly). Many languages have a dedicated suffix.",
};

/**
 * Look up an explanation for an inflection label.
 * Returns undefined if no built-in explanation exists.
 */
export function explainInflection(label: string): string | undefined {
  if (!label) return undefined;
  const key = label.toLowerCase().trim().replace(/\.$/, "");
  return EXPLANATIONS[key];
}
