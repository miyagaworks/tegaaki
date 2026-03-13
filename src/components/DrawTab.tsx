import { useRef, useEffect, useCallback, useState } from 'react'
import { recognize } from '../lib/recognizer'

interface DrawTabProps {
  setCandidates: (candidates: string[]) => void
}

export function DrawTab({ setCandidates }: DrawTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const hasStrokes = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recognizing, setRecognizing] = useState(false)

  const getCanvasPos = useCallback(
    (e: PointerEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      return {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
      }
    },
    [],
  )

  const drawGuideLines = useCallback((ctx: CanvasRenderingContext2D) => {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])

    // Center cross
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()

    // Diagonals
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, h)
    ctx.moveTo(w, 0)
    ctx.lineTo(0, h)
    ctx.stroke()

    ctx.restore()
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawGuideLines(ctx)
    hasStrokes.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setCandidates([])
    setRecognizing(false)
  }, [drawGuideLines, setCandidates])

  const triggerRecognition = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes.current) return
    setRecognizing(true)
    const result = await recognize(canvas)
    setRecognizing(false)
    setCandidates(result.candidates)
  }, [setCandidates])

  const startDebounceTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      triggerRecognition()
    }, 500)
  }, [triggerRecognition])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    drawGuideLines(ctx)

    const handlePointerDown = (e: PointerEvent) => {
      isDrawing.current = true
      canvas.setPointerCapture(e.pointerId)
      const pos = getCanvasPos(e, canvas)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return
      const pos = getCanvasPos(e, canvas)
      const dpr = window.devicePixelRatio || 1
      ctx.lineWidth = 3 * dpr
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      hasStrokes.current = true
    }

    const handlePointerUp = () => {
      if (!isDrawing.current) return
      isDrawing.current = false
      if (hasStrokes.current) {
        startDebounceTimer()
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
    }
  }, [drawGuideLines, getCanvasPos, startDebounceTimer])

  return (
    <div className="draw-tab">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="draw-canvas" />
        <button className="clear-button" type="button" onClick={clearCanvas}>
          クリア
        </button>
      </div>
      {recognizing && <p className="recognizing-indicator">認識中...</p>}
    </div>
  )
}
