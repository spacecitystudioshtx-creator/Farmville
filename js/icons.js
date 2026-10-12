// Pixel icons for the game UI, drawn from 12x12 character maps into data URLs.
// <i class="ico" data-icon="water"></i> elements are filled in by ICONS.apply().
(function () {
  const PAL = {
    k: '#3b2a1a', g: '#3f7a2a', G: '#7cbf4a', y: '#e8a91f', Y: '#ffe08a', o: '#e07b28',
    r: '#c8432f', b: '#3a86c8', B: '#a8dcf2', w: '#fffaf0', n: '#7a4a24', N: '#c08a50',
    s: '#8d939a', S: '#d9dde1',
  };

  const MAPS = {
    look: [
      '...kkkk.....', '..kBBBBk....', '.kBwwBBBk...', '.kBwBBBBk...', '.kBBBBBBk...', '.kBBBBBBk...',
      '..kBBBBk....', '...kkkknn...', '.......nnn..', '........nnn.', '.........nnk', '..........k.',
    ],
    plant: [
      '............', '..GGG..GGG..', '.GGGGg.gGGG.', '..GGgggggG..', '....gggg....', '.....gg.....',
      '.....gg.....', '..nnnnnnnn..', '..nNNNNNNn..', '...nNNNNn...', '...nnnnnn...', '............',
    ],
    water: [
      '............', '......kkkk..', '.....k....k.', 'B...kkkkkkkk', 'BB.kbbbbbbbk', 'BBkbbBbbbbbk',
      '.Bkbbbbbbbbk', '..kbbbbbbbbk', '...kbbbbbbk.', '....kkkkkk..', '..B.....B...', '.B...B....B.',
    ],
    build: [
      '..........nn', '.........nNn', '........nNn.', '.......nNn..', '......nNn...', '.....nNn....',
      '..ss.Nn.....', '.sSSsn......', 'sSSSSs......', 'sSSSs.......', '.sss........', '............',
    ],
    scroll: [
      '............', '.kkkkkkkkk..', 'kYYYYYYYYYk.', '.kYkkkkkYk..', '.kYYYYYYYk..', '.kYkkkkYYk..',
      '.kYYYYYYYk..', '.kYkkkkkYk..', '.kYYYYYYYk..', 'kYYYYYYYYYk.', '.kkkkkkkkk..', '............',
    ],
    flower: [
      '....yyyy....', '...yYyyYy...', '..yynnnnyy..', '..yYnNNnYy..', '..yynnnnyy..', '...yYyyYy...',
      '....yyyy....', '.....gg.....', '..GG.gg.GG..', '...GGggGG...', '.....gg.....', '...gggggg...',
    ],
    star: [
      '.....yy.....', '.....yy.....', '....yYYy....', 'yyyyYYYYyyyy', '.yYYYYYYYYy.', '..yYYYYYYy..',
      '...yYYYYy...', '..yYYyyYYy..', '..yYy..yYy..', '.yy......yy.', '............', '............',
    ],
    flame: [
      '.....r......', '....rr......', '....rorr....', '...rroorr...', '..rrooyorr..', '..roooyyor..',
      '.rooyyyYyor.', '.rooyYYYyor.', '.rooyYYYyor.', '..rooyyyor..', '...rrooor...', '.....rrr....',
    ],
    sun: [
      '.....y......', '..y..y..y...', '...y...y....', '....yyy.....', 'yy.yYYYy.yy.', '...yYYYy....',
      '....yyy.....', '...y...y....', '..y..y..y...', '.....y......', '............', '............',
    ],
    partsun: [
      '...y........', '.y.y.y......', '..yyy.......', 'yyYYYy......', '..yYYyww....', '.y.ywSSSw...',
      '...wSSSSSw..', '.wwSSSSSSSw.', 'wSSSSSSSSSSw', 'wssssssssSSw', '.wwwwwwwwww.', '............',
    ],
    cloud: [
      '............', '............', '....wwww....', '...wSSSSw...', '.wwwSSSSSw..', 'wSSSSSSSSSw.',
      'wSSSSSSSSSSw', 'wssssssssSSw', '.wwwwwwwwww.', '............', '............', '............',
    ],
    rain: [
      '....wwww....', '...wSSSSw...', '.wwwSSSSSw..', 'wSSSSSSSSSw.', 'wSSSSSSSSSSw', 'wssssssssSSw',
      '.wwwwwwwwww.', '............', '..b...b...b.', '.b...b...b..', '............', '...b...b....',
    ],
    storm: [
      '....wwww....', '...wSSSSw...', '.wwwSSSSSw..', 'wSSSSSSSSSw.', 'wSSSSSSSSSSw', 'wssssssssSSw',
      '.wwwwwyyww..', '.....yy.....', '....yyyy....', '......yy....', '.....yy.....', '....y.......',
    ],
    shade: [
      '............', '...gggggg...', '..gGGGGGGg..', '.gGGgGGgGGg.', '.gGGGGGGGGg.', '..gGGgGGGg..',
      '...gggggg...', '.....nn.....', '.....nn.....', '.sssssssss..', 'sssssssssss.', '............',
    ],
    undo: [
      '............', '....k.......', '...kk.......', '..kkkkkkk...', '.kkkkkkkkk..', '..kk.....kk.',
      '...k......k.', '..........k.', '.........kk.', '....kkkkkk..', '............', '............',
    ],
    lock: [
      '............', '....kkkk....', '...k....k...', '...k....k...', '..kkkkkkkk..', '..kssssssk..',
      '..kssSSssk..', '..kssSSssk..', '..ksssssk...', '..kkkkkkkk..', '............', '............',
    ],
    check: [
      '............', '............', '..........g.', '.........gg.', '........gg..', '.g.....gg...',
      '.gg...gg....', '..gg.gg.....', '...ggg......', '....g.......', '............', '............',
    ],
    garden: [
      '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '..kNNNNNNk..',
      '..kNbbNNNk..', '..kNbbNnnk..', '..kNNNNnnk..', 'GGkkkkkkkkGG', 'gGGGgGGGgGGg', '............',
    ],
  };

  const cache = {};
  function url(name) {
    if (cache[name]) return cache[name];
    const map = MAPS[name];
    if (!map) return '';
    const c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    const ctx = c.getContext('2d');
    map.forEach((row, y) => {
      for (let x = 0; x < 12; x++) {
        const col = PAL[row[x]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    });
    return (cache[name] = c.toDataURL());
  }

  function html(name, cls) {
    return `<i class="ico ${cls || ''}" style="background-image:url(${url(name)})" aria-hidden="true"></i>`;
  }

  function apply(root) {
    (root || document).querySelectorAll('i.ico[data-icon]').forEach(el => {
      el.style.backgroundImage = `url(${url(el.dataset.icon)})`;
      el.setAttribute('aria-hidden', 'true');
    });
  }

  window.ICONS = { url, html, apply, MAPS };
})();
