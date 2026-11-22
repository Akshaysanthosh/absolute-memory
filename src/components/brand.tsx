export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <img
        src={light ? '/brand/absolute/horizontal-on-dark.svg' : '/brand/absolute/horizontal.svg'}
        alt="Absolute Memory"
        width={196}
        height={28}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}
export function BookArt({ small = false }: { small?: boolean }) {
  return (
    <div className={`book-art ${small ? 'small' : ''}`} aria-hidden="true">
      <div className="art-orbit" />
      <div className="art-sun" />
      <div className="art-book book-one">
        <span>WONDER</span>
        <i />
      </div>
      <div className="art-book book-two">
        <span>
          THE EVERYDAY
          <br />
          EXTRAORDINARY
        </span>
        <i />
      </div>
      <div className="art-book book-three">
        <span>
          A FIELD GUIDE
          <br />
          TO CURIOSITY
        </span>
        <i />
      </div>
      <div className="art-spark">✳</div>
    </div>
  );
}
