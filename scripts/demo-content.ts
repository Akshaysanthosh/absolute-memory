export const question = 'What did the sensor above the unshaded gravel warn of?';
export const citationQuote =
  'The sensor above the unshaded gravel gave the clearest warning of heat building on the roof.';
export const highlightQuote =
  'We used the same roof, but the instruments told four different stories.';

export const articles = [
  {
    slug: 'a-cooler-roof',
    title: 'A cooler roof for the library',
    site: 'Fieldwork Journal',
    author: 'Maya Sen',
    date: '2026-06-18',
    sections: [
      [
        '',
        [
          'At closing time the reading room was cool, but the stairwell to the roof still felt like a warm cupboard. We spent a week finding out where that heat came from, one sensor and one notebook at a time.',
          highlightQuote,
        ],
      ],
      [
        'Four places to measure',
        [
          'We clipped one sensor under the shade cloth, put another above the planting trays, and set a third beside the copper downpipe. A fourth sat just above the exposed gravel. We took readings at the same hours each day and marked wind changes in the margin.',
          'The shaded tray worked well as a reference. On quiet mornings all four sensors agreed. By late afternoon the downpipe gave a brief spike each time the sun cleared the parapet. The gravel warmed more slowly and stayed warm longer.',
        ],
      ],
      [
        'Where the heat stayed',
        [
          citationQuote,
          'During the two hottest afternoons, this reading rose well before the stairwell warmed. A sensor hidden under the shade cloth responded too late to tell us when to close the roof hatch. The gravel reading also tracked how long the roof took to cool after sunset.',
          'We left the sensor housing a hand’s width above the gravel to let air move around it. An instrument touching the stones would tell us the temperature of the stones, a separate question we put aside for the next visit.',
        ],
      ],
      [
        'What we’ll change next',
        [
          'Next month we’ll cover a small section with a removable shade sail and leave an adjacent strip exposed. The gravel sensor will stay where it is, and a second one will go under the sail. Two weeks of paired readings should tell us whether we’re cooling the roof or simply moving the warmest spot.',
          'The library will keep a paper table by the roof door for anyone who wants to record a reading. Each row has a space for time, wind, cloud cover and a note about anything that moved.',
        ],
      ],
    ],
  },
  {
    slug: 'rain-gauge',
    title: 'A week with a rain gauge',
    site: 'Rain Ledger',
    author: 'Jo Rivera',
    date: '2026-06-14',
    sections: [
      [
        '',
        [
          'I placed a glass gauge at the centre of a gravel garden and checked it each morning at seven. The first shower lasted eleven minutes. The next one was so quiet that only the wet path gave it away.',
          'A piece of masking tape made it easy to record the same height before emptying the tube. At the end of the week the log helped me move the watering rota from an automatic daily reminder to a check after two dry mornings.',
          'I left a second gauge close to a brick wall. It recorded less on every windy day, a small reminder that a single measurement describes its location as much as the weather.',
        ],
      ],
    ],
  },
  {
    slug: 'night-walk',
    title: 'An evening walk along the canal',
    site: 'City Edges',
    author: 'Ari Wells',
    date: '2026-06-10',
    sections: [
      [
        '',
        [
          'The canal path changes character after the last delivery bike passes. From the lock gate I could see where the lamps overlapped and where a short bend dropped out of view.',
          'I marked the dark patches on a folded map, then repeated the walk from the other direction. Two stretches that looked dark on the way out were easy to read on the return because the light came from behind.',
          'The towpath crew plans to try one shielded lamp at the narrowest bend and ask regular walkers to record whether the ground and water edge are easier to distinguish.',
        ],
      ],
    ],
  },
  {
    slug: 'mending-table',
    title: 'At the community mending table',
    site: 'Repair Register',
    author: 'Elsie Cho',
    date: '2026-06-08',
    sections: [
      [
        '',
        [
          'Saturday’s repair table began with two lamps, a roll of paper and a box of thread. The first visitor brought a coat with a good zipper and a torn pocket. We took the lining apart just far enough to turn the seam.',
          'We saved the instructions on a half sheet with a drawing of the fold. At the next session another volunteer used it to finish a similar repair in half the time.',
          'Part of the table stays clear for testing. A repaired pocket gets loaded with the things it normally carries before anyone puts the sewing kit away.',
        ],
      ],
    ],
  },
] as const;

export const note = {
  title: 'Saturday repair café checklist',
  text: 'Bring the portable lamp, sewing kit and fabric scraps. Leave one seat free for walk-ins. Set up the testing table away from the entrance. Record each successful repair and what the next volunteer should check.',
};

export const transcriptTitle = 'A conversation with the seed librarian';
export const transcript = `WEBVTT

00:00:01.000 --> 00:00:08.000
We keep the beans in paper envelopes so the next gardener can write the harvest year on the front.

00:00:09.000 --> 00:00:19.000
At the end of summer, borrowers drop off dry seed with a short note about the parent plant and how it grew.

00:00:20.000 --> 00:00:29.000
We label a drawer for each crop, but leave room for people to compare varieties before taking one home.
`;
