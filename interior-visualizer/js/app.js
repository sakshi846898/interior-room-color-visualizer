(function(){
  // Elements
  const imgInput = document.getElementById('imgInput');
  const canvas = document.getElementById('imgCanvas');
  const ctx = canvas.getContext('2d');
  const tol = document.getElementById('tol');
  const paletteEl = document.getElementById('palette');
  const applyBtn = document.getElementById('apply');
  const downloadBtn = document.getElementById('download');
  const sampleBtn = document.getElementById('sampleBtn');
  const brushBtn = document.getElementById('brushBtn');
  const eraseBtn = document.getElementById('eraseBtn');
  const clearMaskBtn = document.getElementById('clearMask');
  const brushSizeInput = document.getElementById('brushSize');
  const previewSmall = document.getElementById('previewSmall');
  const placeholder = document.getElementById('placeholder');

  // State
  let img = new Image();
  let mask = null;
  let mode = 'sample';
  let isDrawing = false;
  let brushSize = Number(brushSizeInput.value) || 30;
  let currentColor = [200,80,80];

  // Palette
  const palette = [
    {name:'Pure White', hex:'#ffffff'},
    {name:'Warm Cream', hex:'#f8f3e6'},
    {name:'Sand', hex:'#e6d8c3'},
    {name:'Rose Clay', hex:'#e38b8b'},
    {name:'Mint Mist', hex:'#c3e6d8'},
    {name:'Soft Blue', hex:'#9fb1c9'},
    {name:'Ocean Blue', hex:'#2b7aee'},
    {name:'Slate', hex:'#6b7280'}
  ];

  // build palette UI
  palette.forEach((p,i)=>{
    const el = document.createElement('div'); el.className='chip'; el.style.background = p.hex;
    const hexLabel = document.createElement('div'); hexLabel.className='hex'; hexLabel.textContent = p.name + ' • ' + p.hex;
    el.appendChild(hexLabel);
    el.addEventListener('click', ()=>{
      currentColor = hexToRgb(p.hex); selectChip(el);
      navigator.clipboard?.writeText(p.hex).catch(()=>{});
    });
    el.addEventListener('mouseenter', ()=> el.classList.add('show-hex'));
    el.addEventListener('mouseleave', ()=> el.classList.remove('show-hex'));
    paletteEl.appendChild(el);
    if(i===0){ selectChip(el); currentColor = hexToRgb(p.hex); }
  });

  function selectChip(node){ document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active')); node.classList.add('active'); previewSmall.style.background = node.style.background; }

  // load image
  imgInput.addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return;
    img.onload = ()=>{ fitCanvas(); showCanvas(); render(); console.log('Image loaded', canvas.width, canvas.height); };
    img.src = URL.createObjectURL(f);
  });

  function fitCanvas(){
    const maxW=320, maxH=600;
    let w = img.width, h = img.height;
    const r = Math.min(maxW/w, maxH/h, 1);
    canvas.width = Math.round(w*r); canvas.height = Math.round(h*r);
  }
  function showCanvas(){ placeholder.style.display='none'; canvas.style.display='block'; }
  function hideCanvas(){ placeholder.style.display='flex'; canvas.style.display='none'; }

  // modes
  sampleBtn.addEventListener('click', ()=> setMode('sample'));
  brushBtn.addEventListener('click', ()=> setMode('brush'));
  eraseBtn.addEventListener('click', ()=> setMode('erase'));
  clearMaskBtn.addEventListener('click', ()=> { mask = null; render(); });

  function setMode(m){ mode = m; document.querySelectorAll('.btn.small').forEach(b=>b.classList.remove('active')); if(m==='sample') sampleBtn.classList.add('active'); if(m==='brush') brushBtn.classList.add('active'); if(m==='erase') eraseBtn.classList.add('active'); }

  brushSizeInput.addEventListener('input', ()=> brushSize = Number(brushSizeInput.value));

  // sample click
  canvas.addEventListener('click', (e)=>{
    if(!img.src) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    if(mode === 'sample') sampleAt(x,y);
  });

  // brush drawing
  canvas.addEventListener('mousedown', (e)=> { if(mode!=='brush' && mode!=='erase') return; isDrawing=true; paintAtEvent(e); });
  window.addEventListener('mouseup', ()=> isDrawing=false);
  canvas.addEventListener('mousemove', (e)=> { if(isDrawing) paintAtEvent(e); });
  canvas.addEventListener('mouseleave', ()=> isDrawing=false);

  function paintAtEvent(ev){
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(ev.clientX - rect.left);
    const y = Math.round(ev.clientY - rect.top);
    paintAt(x,y);
  }
  function paintAt(cx,cy){
    if(!mask) mask = new Uint8ClampedArray(canvas.width*canvas.height);
    const radius = Math.max(1, Math.round(brushSize/2));
    for(let dy=-radius; dy<=radius; dy++){
      for(let dx=-radius; dx<=radius; dx++){
        const nx = cx + dx, ny = cy + dy;
        if(nx<0||ny<0||nx>=canvas.width||ny>=canvas.height) continue;
        if(dx*dx+dy*dy > radius*radius) continue;
        const idx = ny*canvas.width + nx;
        if(mode === 'brush') mask[idx] = 1;
        else if(mode === 'erase') mask[idx] = 0;
      }
    }
    render();
  }

  // sampling flood fill
  function sampleAt(sx,sy){
    try{
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const data = imageData.data;
      const startIdx = (sy*canvas.width + sx)*4;
      const target = [data[startIdx], data[startIdx+1], data[startIdx+2]];
      const t = Number(tol.value);
      mask = new Uint8ClampedArray(canvas.width*canvas.height);
      const stack = [[sx,sy]];
      while(stack.length){
        const [x,y] = stack.pop();
        if(x<0||y<0||x>=canvas.width||y>=canvas.height) continue;
        const i = y*canvas.width + x;
        if(mask[i]) continue;
        const id = i*4;
        const r = data[id], g = data[id+1], b = data[id+2];
        if(Math.abs(r-target[0])+Math.abs(g-target[1])+Math.abs(b-target[2]) <= t){
          mask[i]=1;
          stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
        }
      }
      console.log('Sample done. Selected pixels:', maskCount());
      render();
    }catch(err){ console.error('sampleAt error', err); alert('Selection failed — open console and paste error here.'); }
  }

  // apply color
  applyBtn.addEventListener('click', ()=>{
    if(!mask){ alert('No selection. Click to sample or use brush.'); return; }
    const selected = maskCount();
    if(selected===0){ alert('Selection empty. Increase tolerance or use brush.'); return; }
    try{
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const d = imageData.data;
      const alpha = 0.8;
      let changed = 0;
      for(let i=0;i<mask.length;i++){
        if(mask[i]){
          const id = i*4;
          d[id]   = Math.round(d[id]   * (1-alpha) + currentColor[0]*alpha);
          d[id+1] = Math.round(d[id+1] * (1-alpha) + currentColor[1]*alpha);
          d[id+2] = Math.round(d[id+2] * (1-alpha) + currentColor[2]*alpha);
          changed++;
        }
      }
      ctx.putImageData(imageData,0,0);
      alert('Color applied ✓ (changed pixels: ' + changed + ')');
      console.log('Apply done. changed pixels:', changed);
    }catch(err){ console.error('Apply error', err); alert('Apply failed — check console and paste error.'); }
  });

  // download
  downloadBtn.addEventListener('click', ()=> { if(!canvas.width) return alert('No image'); const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download='recolor.png'; a.click(); });

  // render overlay
  function render(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!img.src){ hideCanvas(); return; }
    showCanvas();
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    if(mask){
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const d = imageData.data;
      for(let i=0;i<mask.length;i++){
        if(mask[i]){
          const idx = i*4;
          d[idx]   = Math.round(d[idx]*0.6 + 40);
          d[idx+1] = Math.round(d[idx+1]*0.6 + 80);
          d[idx+2] = Math.round(d[idx+2]*0.6 + 120);
        }
      }
      ctx.putImageData(imageData,0,0);
    }
  }

  function maskCount(){ if(!mask) return 0; let c=0; for(let i=0;i<mask.length;i++) if(mask[i]) c++; return c; }
  function hexToRgb(hex){ const c = hex.replace('#',''); return [parseInt(c.substring(0,2),16),parseInt(c.substring(2,4),16),parseInt(c.substring(4,6),16)]; }

  // initial render
  render();

  // expose quick debug helper
  window.__vis = { maskCount: ()=>maskCount(), mask };
})();
