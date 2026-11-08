/*
quotes.js — the quotes a player collects by winning (see ROADMAP.md, Phase 1).

Each quote:
- id:          permanent identifier. Collected quotes are saved by id, so an
               id must NEVER change once the game has shipped, even if the
               quote's wording or attribution is corrected. To retire a quote,
               remove it; to add one, give it a new id.
- text:        the quote, without surrounding quotation marks (the page adds
               them).
- author:      shown after the dash.
- source:      optional, shown after the author and a comma. Titles of works
               are wrapped in *asterisks* and displayed in a <cite>.
- translation: optional, not displayed. The public-domain translation the
               wording comes from, kept for checking licensing.

Order here doesn't matter to the game: quotes fill the achievement slots in
the order the player collects them.

Source: Bill's "Forty Thieves Quote Candidates" list in Notion (Nov 2026),
the 40 quotes left after cutting 10 of 50.
*/

export const QUOTES = [
    {
        id: 'socrates-unexamined-life',
        text: 'The unexamined life is not worth living.',
        author: 'Socrates',
        source: 'in Plato’s *Apology*',
        translation: 'Jowett, 1871'
    },
    {
        id: 'seneca-postponing',
        text: 'While we are postponing, life speeds by.',
        author: 'Seneca',
        source: '*Moral Letters to Lucilius*, Letter 1',
        translation: 'Gummere, 1917'
    },
    {
        id: 'confucius-knowledge',
        text: 'When you know a thing, to hold that you know it; and when you do not know a thing, to allow that you do not know it; this is knowledge.',
        author: 'Confucius',
        source: '*Analects* 2.17',
        translation: 'Legge, 1861'
    },
    {
        id: 'lao-tzu-journey',
        text: 'A journey of a thousand miles begins with a single step.',
        author: 'Lao Tzu',
        source: '*Tao Te Ching*, ch. 64'
        // TODO: no public-domain translation named for the "miles" wording
        // (Legge-era translations say "li"). Confirm before the game is sold.
    },
    {
        id: 'shakespeare-not-in-our-stars',
        text: 'The fault, dear Brutus, is not in our stars, but in ourselves.',
        author: 'William Shakespeare',
        source: '*Julius Caesar*'
    },
    {
        id: 'pope-to-err',
        text: 'To err is human, to forgive divine.',
        author: 'Alexander Pope',
        source: '*An Essay on Criticism*'
    },
    {
        id: 'emerson-peace',
        text: 'Nothing can bring you peace but yourself.',
        author: 'Ralph Waldo Emerson',
        source: '“Self-Reliance”'
    },
    {
        id: 'delphi-know-thyself',
        text: 'Know thyself.',
        author: 'Delphic maxim',
        source: 'Temple of Apollo at Delphi'
    },
    {
        id: 'dickinson-hope',
        text: 'Hope is the thing with feathers that perches in the soul.',
        author: 'Emily Dickinson'
    },
    {
        id: 'twain-facts',
        text: 'Get your facts first, and then you can distort them as much as you please.',
        author: 'Mark Twain',
        source: 'quoted by Rudyard Kipling in *From Sea to Sea*'
    },
    {
        id: 'twain-always-do-right',
        text: 'Always do right. This will gratify some people and astonish the rest.',
        author: 'Mark Twain',
        source: 'note to the Young People’s Society'
    },
    {
        id: 'wilde-temptation',
        text: 'I can resist everything except temptation.',
        author: 'Oscar Wilde',
        source: '*Lady Windermere’s Fan*'
    },
    {
        id: 'wilde-experience',
        text: 'Experience is the name every one gives to their mistakes.',
        author: 'Oscar Wilde',
        source: '*Lady Windermere’s Fan*'
    },
    {
        id: 'franklin-three-may-keep-a-secret',
        text: 'Three may keep a secret, if two of them are dead.',
        author: 'Benjamin Franklin',
        source: '*Poor Richard’s Almanack*'
    },
    {
        id: 'austen-one-half-of-the-world',
        text: 'One half of the world cannot understand the pleasures of the other.',
        author: 'Jane Austen',
        source: '*Emma*'
    },
    {
        id: 'terence-fortune-favors',
        text: 'Fortune favors the bold.',
        author: 'Terence',
        source: '*Phormio*'
    },
    {
        id: 'cervantes-shuffle-the-cards',
        text: 'Patience, and shuffle the cards.',
        author: 'Miguel de Cervantes',
        source: '*Don Quixote*, Part II',
        translation: 'Ormsby, 1885'
    },
    {
        id: 'pasteur-prepared-mind',
        text: 'Chance favors only the prepared mind.',
        author: 'Louis Pasteur',
        source: 'lecture at the University of Lille'
    },
    {
        id: 'aesop-slow-but-steady',
        text: 'Slow but steady wins the race.',
        author: 'Aesop',
        source: '“The Hare and the Tortoise”',
        translation: 'Townsend, 1867'
    },
    {
        id: 'ovid-dripping-water',
        text: 'Dripping water hollows out stone.',
        author: 'Ovid',
        source: '*Epistulae ex Ponto*'
    },
    {
        id: 'pascal-heart-has-its-reasons',
        text: 'The heart has its reasons, which reason does not know.',
        author: 'Blaise Pascal',
        source: '*Pensées*'
    },
    {
        id: 'kierkegaard-backwards-forwards',
        text: 'Life can only be understood backwards; but it must be lived forwards.',
        author: 'Søren Kierkegaard',
        source: '*Journals*'
    },
    {
        id: 'montaigne-what-do-i-know',
        text: 'What do I know?',
        author: 'Michel de Montaigne',
        source: 'personal motto, from the *Essays*'
    },
    {
        id: 'austen-make-sport',
        text: 'For what do we live, but to make sport for our neighbours, and laugh at them in our turn?',
        author: 'Jane Austen',
        source: '*Pride and Prejudice*'
    },
    {
        id: 'austen-good-novel',
        text: 'The person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.',
        author: 'Jane Austen',
        source: '*Northanger Abbey*'
    },
    {
        id: 'eliot-nothing-to-say',
        text: 'Blessed is the man who, having nothing to say, abstains from giving wordy evidence of the fact.',
        author: 'George Eliot',
        source: '*Impressions of Theophrastus Such*'
    },
    {
        id: 'bierce-patience',
        text: 'Patience, n. A minor form of despair, disguised as a virtue.',
        author: 'Ambrose Bierce',
        source: '*The Devil’s Dictionary*'
    },
    {
        id: 'chesterton-angels',
        text: 'Angels can fly because they take themselves lightly.',
        author: 'G. K. Chesterton',
        source: '*Orthodoxy*'
    },
    {
        id: 'jerome-idling',
        text: 'It is impossible to enjoy idling thoroughly unless one has plenty of work to do.',
        author: 'Jerome K. Jerome',
        source: '*Idle Thoughts of an Idle Fellow*'
    },
    {
        id: 'eliot-less-difficult',
        text: 'What do we live for, if it is not to make life less difficult to each other?',
        author: 'George Eliot',
        source: '*Middlemarch*'
    },
    {
        id: 'shelley-sudden-change',
        text: 'Nothing is so painful to the human mind as a great and sudden change.',
        author: 'Mary Shelley',
        source: '*Frankenstein*'
    },
    {
        id: 'alcott-storms',
        text: 'I’m not afraid of storms, for I’m learning how to sail my ship.',
        author: 'Louisa May Alcott',
        source: '*Little Women*'
    },
    {
        id: 'wollstonecraft-power-over-themselves',
        text: 'I do not wish them to have power over men; but over themselves.',
        author: 'Mary Wollstonecraft',
        source: '*A Vindication of the Rights of Woman*'
    },
    {
        id: 'keller-overcoming',
        text: 'Although the world is full of suffering, it is full also of the overcoming of it.',
        author: 'Helen Keller',
        source: '*Optimism*'
    },
    {
        id: 'wharton-spreading-light',
        text: 'There are two ways of spreading light: to be the candle or the mirror that reflects it.',
        author: 'Edith Wharton',
        source: '“Vesalius in Zante”'
    },
    {
        id: 'adams-learning',
        text: 'Learning is not attained by chance, it must be sought for with ardor and attended to with diligence.',
        author: 'Abigail Adams',
        source: 'letter to John Quincy Adams'
    },
    {
        id: 'gibran-joy-and-sorrow',
        text: 'Your joy is your sorrow unmasked.',
        author: 'Kahlil Gibran',
        source: '*The Prophet*'
    },
    {
        id: 'ecclesiastes-time-and-chance',
        text: 'The race is not to the swift, nor the battle to the strong… but time and chance happeneth to them all.',
        author: 'Ecclesiastes 9:11',
        source: 'King James Version'
    },
    {
        id: 'proverbs-holdeth-his-peace',
        text: 'Even a fool, when he holdeth his peace, is counted wise.',
        author: 'Proverbs 17:28',
        source: 'King James Version'
    },
    {
        id: 'gibran-work-is-love',
        text: 'Work is love made visible.',
        author: 'Kahlil Gibran',
        source: '*The Prophet*'
    }
];
