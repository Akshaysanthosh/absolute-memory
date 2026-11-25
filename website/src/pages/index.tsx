import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';
import styles from './index.module.css';

const features = [
  {
    title: 'Save anything worth reading',
    text: 'Keep articles, PDFs and notes together. Save supported podcast episodes and read timed transcripts when they’re available.',
    image: 'library.png',
    alt: 'Saved articles, a podcast, a PDF and a note in the library.',
    width: 2880,
    height: 1800,
    guide: '/guides/media/',
    link: 'Supported media',
  },
  {
    title: 'A reader with highlights',
    text: 'Give the page some room and adjust the type to suit you. Highlight a passage and return to it from your Highlights list.',
    image: 'reader-light.png',
    alt: 'The light reader with an illustrated article and a highlighted sentence.',
    width: 2560,
    height: 2040,
    guide: '/guides/architecture/reader/',
    link: 'How the reader works',
  },
  {
    title: 'Ask your library, follow the citation',
    text: 'With a chat model configured, ask a question about your saved reading. Open a citation to see the passage the answer draws on.',
    image: 'ask-citation.png',
    alt: 'A chat answer beside the reader passage it cites.',
    width: 3458,
    height: 1640,
    guide: '/guides/providers/',
    link: 'Set up a model',
  },
  {
    title: 'Find it by word or by meaning',
    text: 'Search the full text or browse by topic. Add an embedding provider for semantic matches across your saved passages.',
    image: 'library-search.png',
    alt: 'The library filtered to the repair topic.',
    width: 1280,
    height: 800,
    guide: '/guides/architecture/search/',
    link: 'How search works',
  },
  {
    title: 'Connect your AI tools with MCP',
    text: 'Use the local stdio server to connect a compatible client to your instance. A scoped key controls whether it can read or also save.',
    image: 'connections-mcp.png',
    alt: 'The Personal API keys screen used to make a key for MCP and the CLI.',
    width: 1280,
    height: 800,
    guide: '/guides/mcp/',
    link: 'Connect an MCP client',
  },
  {
    title: 'Your library, ready to move',
    text: 'Export a ZIP with your saved content and original files. The archive format is documented, and you can import it into another instance.',
    image: 'library-export.png',
    alt: 'Export settings with the option to export the entire library.',
    width: 1280,
    height: 800,
    guide: '/guides/export-format/',
    link: 'Read the export format',
  },
];

const install = [
  'docker build -t absolute-memory:local .',
  'docker run -d --name absolute-memory -p 127.0.0.1:3000:3000 \\',
  '  -v absolute-memory-data:/data \\',
  '  -e AUTH_SECRET="$(openssl rand -base64 32)" absolute-memory:local',
].join('\n');

function Actions() {
  return (
    <div className={styles.actions}>
      <Link className={styles.primary} to="/guides/getting-started/">
        Install
      </Link>
      <Link className={styles.secondary} to="/guides/">
        Docs
      </Link>
    </div>
  );
}

function Feature({ feature, reverse }: { feature: (typeof features)[number]; reverse: boolean }) {
  const source = useBaseUrl(`media/${feature.image}`);
  return (
    <article className={`${styles.feature} ${reverse ? styles.reverse : ''}`}>
      <div className={styles.featureText}>
        <h3>{feature.title}</h3>
        <p>{feature.text}</p>
        <Link to={feature.guide}>{feature.link}</Link>
      </div>
      <img
        className={styles.frame}
        src={source}
        alt={feature.alt}
        width={feature.width}
        height={feature.height}
        loading="lazy"
      />
    </article>
  );
}

export default function Home() {
  const light = useBaseUrl('media/library.png');
  const dark = useBaseUrl('media/library-dark.png');
  const demo = useBaseUrl('media/demo.mp4');
  return (
    <Layout description="Save, highlight and search your reading in a library you run yourself.">
      <main id="main-content">
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1>Your reading library, with answers that cite the page.</h1>
            <p>Save articles, PDFs, notes and podcasts. Find them again on a server you control.</p>
            <Actions />
          </div>
          <ThemedImage
            className={`${styles.frame} ${styles.heroImage}`}
            sources={{ light, dark }}
            alt="A library of saved articles, notes, podcasts and PDFs, with topics and search."
            width={1440}
            height={900}
            fetchPriority="high"
          />
        </header>

        <section className={styles.demo} aria-labelledby="demo">
          <div className={styles.sectionHeading}>
            <h2 id="demo">From saved article to cited answer</h2>
            <p>
              Watch a sentence get highlighted, then see an answer take you back to that same
              passage.
            </p>
          </div>
          <video
            className={styles.frame}
            src={demo}
            poster={light}
            width={1280}
            height={800}
            muted
            loop
            controls
            playsInline
            preload="metadata"
            aria-label="Demo of opening an article, highlighting a sentence and following a citation."
          />
          <p className={styles.demoLink}>
            <a href={demo}>Open the demo video</a>
          </p>
          <details className={styles.transcript}>
            <summary>Demo transcript</summary>
            <ol>
              <li>Open “A cooler roof for the library” from the saved library.</li>
              <li>
                In the reader, select the sentence about the unshaded gravel and highlight it.
              </li>
              <li>Open Chat and select that article as the saved reading.</li>
              <li>
                Ask what the gravel sensor warned of. The answer says that heat was building on the
                roof and includes a numbered citation.
              </li>
              <li>Open the citation. The reader returns to the highlighted sentence.</li>
            </ol>
          </details>
        </section>

        <section className={styles.features} aria-labelledby="features">
          <h2 id="features" className={styles.sectionHeading}>
            A place to come back to what you read
          </h2>
          {features.map((feature, index) => (
            <Feature key={feature.title} feature={feature} reverse={index % 2 === 1} />
          ))}
        </section>

        <section className={styles.selfHost} aria-labelledby="self-hosted">
          <div>
            <h2 id="self-hosted">Run it on your own server</h2>
            <p>
              Lite runs the app, background worker and PGlite in one container. Standard uses
              separate web and worker containers with PostgreSQL and pgvector.
            </p>
            <p>
              AI is optional. Source sites are contacted when you save a link. If you enable a
              model, requests go to whichever endpoint you configure. The app sends no telemetry.
            </p>
            <Link to="/guides/privacy/">Privacy and network use</Link>
          </div>
          <div className={styles.install}>
            <h3>Start Lite with Docker</h3>
            <p>Run this from the repository with Docker and OpenSSL installed.</p>
            <CodeBlock language="sh">{install}</CodeBlock>
          </div>
        </section>

        <section className={styles.final}>
          <h2>Start your reading library</h2>
          <Actions />
        </section>
      </main>
    </Layout>
  );
}
