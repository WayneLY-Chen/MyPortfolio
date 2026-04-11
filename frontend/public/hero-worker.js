// Hero canvas worker — runs entirely off the main thread
const FRAME_COUNT = 231
const _bitmapCache = new Array(FRAME_COUNT).fill(null)

let ctx = null
let pendingFrame = -1  // frame requested but bitmap not yet available

self.onmessage = (e) => {
  const { type } = e.data

  if (type === 'init') {
    ctx = e.data.canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'
    return
  }

  if (type === 'bitmap') {
    _bitmapCache[e.data.idx] = e.data.bitmap
    // If this is the frame we were waiting for (or close enough), draw it now
    if (pendingFrame >= 0 && e.data.idx >= pendingFrame) {
      drawFrame(pendingFrame)
      pendingFrame = -1
    }
    return
  }

  if (type === 'resize') {
    if (!ctx) return
    ctx.canvas.width = e.data.width
    ctx.canvas.height = e.data.height
    // Redraw last known frame after resize clears canvas
    if (pendingFrame >= 0) drawFrame(pendingFrame)
    return
  }

  if (type === 'frame') {
    const drawn = drawFrame(e.data.idx)
    if (!drawn) {
      // Bitmap not ready yet — remember this request
      pendingFrame = e.data.idx
    }
    return
  }
}

function drawFrame(idx) {
  if (!ctx) return false
  // Find nearest available bitmap at or before idx
  let bm = _bitmapCache[idx]
  if (!bm) {
    for (let c = idx - 1; c >= 0; c--) {
      if (_bitmapCache[c]) { bm = _bitmapCache[c]; break }
    }
  }
  if (!bm) return false
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  const scale = Math.max(cw / bm.width, ch / bm.height)
  ctx.clearRect(0, 0, cw, ch)
  ctx.drawImage(bm, (cw - bm.width * scale) / 2, (ch - bm.height * scale) / 2, bm.width * scale, bm.height * scale)
  return true
}
