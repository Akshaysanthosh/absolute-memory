// Demo library used for README screenshots and the demo GIF.
// Article text is from Wikipedia (CC BY-SA 4.0); images are NASA photographs (public domain);
// the Rice University speech is a US government work (public domain). See docs/media/CREDITS.md.
// Video items link to public YouTube talks; their passages are our own chapter notes, not transcripts.

const wikimedia = (path: string, width = 1280) =>
  `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}/${width}px-${path.split('/').at(-1)}`;

export const question = 'What usable fuel was remaining when Eagle landed?';
export const citationQuote =
  'Eagle landed at 20:17:40 UTC on Sunday July 20 with 216 pounds (98 kg) of usable fuel remaining.';
export const highlightQuote =
  'Armstrong became the first human to walk on the Moon approximately six hours after landing.';
export const answer = (passage: number) =>
  `Eagle touched down with **216 pounds (98 kg)** of usable fuel left, which the crew believed was about 25 seconds of powered flight before an abort. [${passage}]`;

export const articles = [
  {
    slug: 'apollo-11',
    title: 'Apollo 11',
    site: 'Wikipedia',
    author: 'Wikipedia contributors',
    date: '2026-11-18',
    focus: 0.3,
    image: wikimedia('4/41/A_Man_on_the_Moon%2C_AS11-40-5903_%28cropped%29.jpg'),
    sections: [
      [
        '',
        [
          'Apollo 11 (July 16–24, 1969) was the American spaceflight that first landed humans on the Moon.',
          `Armstrong and Aldrin descended to the surface aboard the LM Eagle, landing in the Sea of Tranquility on July 20 at 20:17 UTC. ${highlightQuote} He was joined by Aldrin nineteen minutes later.`,
          'The mission was crewed by Commander Neil Armstrong, Command Module Pilot Michael Collins, and Lunar Module Pilot Edwin “Buzz” Aldrin, all of whom were on their second and final spaceflight.',
        ],
      ],
      [
        'Launch and flight to lunar orbit',
        [
          'An estimated one million spectators watched the launch of Apollo 11 from the highways and beaches in the vicinity of the launch site. Around 3,500 media representatives were present. The launch was televised live in 33 countries, with an estimated 25 million viewers in the United States alone. Millions more around the world listened to radio broadcasts.',
          'Saturn V AS-506 launched Apollo 11 on July 16, 1969, at 13:32:00 UTC (9:32:00 EDT). At 13.2 seconds into the flight, the vehicle began to roll into its flight azimuth of 72.058°. Full shutdown of the first-stage engines occurred about 2 minutes and 42 seconds into the mission, followed by separation of the S-IC and ignition of the S-II engines. The second stage engines then cut off and separated at about 9 minutes and 8 seconds, allowing the first ignition of the S-IVB engine a few seconds later.',
          'Apollo 11 entered a near-circular Earth orbit twelve minutes into its flight. After one and a half orbits, which took around two and a half hours, a second ignition of the S-IVB engine pushed the spacecraft onto its trajectory toward the Moon with the trans-lunar injection burn. About 30 minutes later, with Collins in the left seat and at the controls, the transposition, docking, and extraction maneuver was performed.',
        ],
      ],
      [
        'Landing',
        [
          citationQuote,
          `Information available to the crew and mission controllers during the landing showed the LM had enough fuel for another 25 seconds of powered flight before an abort without touchdown would have become unsafe, but post-mission analysis showed that the real figure was probably closer to 50 seconds.`,
          'Armstrong acknowledged Aldrin’s completion of the post-landing checklist with “Engine arm is off”, before responding to the CAPCOM, Charles Duke, with the words, “Houston, Tranquility Base here. The Eagle has landed.”',
        ],
      ],
      [
        'Lunar surface operations',
        [
          'After describing the surface dust as “very fine-grained” and “almost like a powder”, at 02:56:15, six and a half hours after landing, Armstrong stepped off Eagle’s landing pad and declared: “That’s one small step for [a] man, one giant leap for mankind.”',
          'Despite some technical and weather difficulties, black and white images of the first lunar EVA were received and broadcast to at least 600 million people on Earth.',
        ],
      ],
    ],
  },
  {
    slug: 'hubble-space-telescope',
    title: 'Hubble Space Telescope',
    site: 'Wikipedia',
    author: 'Wikipedia contributors',
    date: '2026-11-12',
    focus: 0.5,
    image: wikimedia('4/4a/Hubble_2009_close-up_2.jpg'),
    sections: [
      [
        '',
        [
          'The Hubble Space Telescope is a space telescope that was launched into low Earth orbit in 1990 on STS-31 and remains in operation. It is regarded as one of the largest and most versatile space telescopes, renowned as a vital research tool and as a public relations boon for astronomy.',
          'Hubble was launched on STS-31 in 1990, but its main mirror had been ground incorrectly, resulting in spherical aberration that compromised the telescope’s capabilities. The optics were corrected to their intended quality by a servicing mission, STS-61, in 1993.',
          'Hubble is the only telescope designed to be maintained in space by astronauts. Five Space Shuttle missions repaired, upgraded, and replaced systems on the telescope, including all five of the main instruments.',
        ],
      ],
    ],
  },
] as const;

/** Public talks, saved by URL. Passages are our own chapter notes, not transcripts. */
export const videos = [
  {
    id: 'UF8uR6Z6KLc',
    title: 'Steve Jobs’ 2005 Stanford Commencement Address',
    channel: 'Stanford',
    chapters: [
      'Story one, connecting the dots: dropping out of Reed College and sitting in on a calligraphy class that later shaped the Mac’s typography.',
      'Story two, love and loss: being fired from Apple at thirty, then starting NeXT and Pixar.',
      'Story three, death: a cancer diagnosis, and why remembering that time is limited helps with every big choice.',
      'The close: the farewell message from the back cover of the Whole Earth Catalog.',
    ],
  },
  {
    id: 'jvqFAi7vkBc',
    title: 'Sam Altman: OpenAI, GPT-5, Sora, Board Saga, Elon Musk, Ilya, Power & AGI',
    channel: 'Lex Fridman Podcast #419',
    chapters: [
      'The OpenAI board saga of November 2023, and what it taught him about governance and trust.',
      'Sora and video generation: what a model learns about the world from watching video.',
      'GPT-4, GPT-5 and the path to AGI: compute as a currency, and how fast capabilities improve.',
      'Power and safety: why no single person should control AGI.',
    ],
  },
  {
    id: 'zjkBMFhNj_g',
    title: '[1hr Talk] Intro to Large Language Models',
    channel: 'Andrej Karpathy',
    chapters: [
      'Part one: a large language model is two files, the parameters and the code that runs them.',
      'Training compresses a large slice of the internet into the parameters; fine-tuning turns that model into an assistant.',
      'Part two: the future of LLMs, from scaling laws and tool use to multimodality and System 2 thinking.',
      'Part three: LLM security, including jailbreaks, prompt injection and data poisoning.',
    ],
  },
] as const;

export const note = {
  title: 'Ideas from the Stanford speech',
  text: 'You can only connect the dots looking backwards, so trust that they will connect later. Being fired from Apple freed him to start again. Remembering that time is short makes the hard choices easier. Stay hungry, stay foolish. Re-watch the calligraphy story before Thursday’s design review.',
};

export const transcriptTitle = 'We choose to go to the Moon';
export const transcriptAuthor = 'John F. Kennedy at Rice University, 1962';
export const transcriptImage =
  'https://upload.wikimedia.org/wikipedia/commons/5/56/John_F._Kennedy_speaks_at_Rice_University.jpg';
// Timings are approximate.
export const transcript = `WEBVTT

00:00:46.000 --> 00:00:58.000
We meet at a college noted for knowledge, in a city noted for progress, in a state noted for strength, and we stand in need of all three.

00:06:38.000 --> 00:06:50.000
We set sail on this new sea because there is new knowledge to be gained, and new rights to be won, and they must be won and used for the progress of all people.

00:07:40.000 --> 00:07:52.000
There is no strife, no prejudice, no national conflict in outer space as yet. Its hazards are hostile to us all.

00:08:24.000 --> 00:08:40.000
But why, some say, the Moon? Why choose this as our goal? And they may well ask, why climb the highest mountain? Why, 35 years ago, fly the Atlantic? Why does Rice play Texas?

00:08:44.000 --> 00:08:58.000
We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard.

00:08:58.000 --> 00:09:12.000
Because that goal will serve to organize and measure the best of our energies and skills, because that challenge is one that we are willing to accept, one we are unwilling to postpone, and one we intend to win.
`;

/** One summary and three tags per item, matched by a phrase from its text. */
export const summaries: [signature: string, summary: string, ...tags: string[]][] = [
  [
    'Sea of Tranquility',
    'How Apollo 11 landed in the Sea of Tranquility with seconds of fuel to spare, and the first moonwalk.',
    'Space',
    'History',
    'Apollo',
  ],
  [
    'spherical aberration',
    'Hubble’s launch in 1990, the flawed mirror and the servicing missions that fixed and upgraded it.',
    'Space',
    'Science',
    'Telescopes',
  ],
  [
    'calligraphy class',
    'Jobs tells three stories: connecting the dots, love and loss, and death.',
    'Talks',
    'Startups',
    'Leadership',
  ],
  [
    'board saga',
    'Altman on the OpenAI board crisis, Sora, the road to GPT-5 and who should control AGI.',
    'AI',
    'Talks',
    'Startups',
  ],
  [
    'two files',
    'A one-hour introduction to how LLMs are trained, where they are heading and how they are attacked.',
    'AI',
    'Talks',
    'Science',
  ],
  [
    'new sea',
    'Kennedy makes the case for going to the Moon “not because they are easy, but because they are hard.”',
    'Space',
    'History',
    'Talks',
  ],
  [
    'connect the dots',
    'Notes on the Stanford speech to bring to the design review.',
    'Leadership',
    'Talks',
    'Startups',
  ],
  [
    'Apollo 11 flight timeline',
    'Key times of the Apollo 11 mission, from launch to splashdown.',
    'Space',
    'History',
    'Apollo',
  ],
  [
    'context window',
    'A voice memo on what to try after the LLM talk.',
    'AI',
    'Startups',
    'Science',
  ],
];
