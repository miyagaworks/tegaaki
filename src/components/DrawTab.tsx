import { useRef, useEffect, useCallback, useState } from 'react'
import { recognize, isModelReady, preloadModel } from '../lib/recognizer'

interface DrawTabProps {
  setCandidates: (candidates: string[]) => void
}

interface Point {
  x: number
  y: number
}

type Stroke = Point[]

function drawSmoothStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lineWidth: number,
) {
  if (points.length < 2) return

  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1a1a1a'
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length - 1; i++) {
    const midpointX = (points[i].x + points[i + 1].x) / 2
    const midpointY = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, midpointX, midpointY)
  }

  const lastPoint = points[points.length - 1]
  ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, lastPoint.x, lastPoint.y)
  ctx.stroke()
}

export function DrawTab({ setCandidates }: DrawTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const activeStrokeRef = useRef<Stroke | null>(null)
  const predictedPointsRef = useRef<Point[]>([])
  const renderFrameRef = useRef<number | null>(null)
  const requestRenderRef = useRef<() => void>(() => {})
  const isDrawing = useRef(false)
  const hasStrokes = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [modelReady, setModelReady] = useState(isModelReady())

  const drawGuideLines = useCallback((ctx: CanvasRenderingContext2D) => {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 8])

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

  const renderCanvas = useCallback(() => {
    const ctx = contextRef.current
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const strokeWidth = Math.min(
      14 * dpr,
      Math.max(8 * dpr, Math.min(ctx.canvas.width, ctx.canvas.height) / 35),
    )
    const activeStroke = activeStrokeRef.current
    const predictedPoints = predictedPointsRef.current

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    drawGuideLines(ctx)

    for (const stroke of strokesRef.current) {
      if (stroke === activeStroke && predictedPoints.length > 0) continue
      drawSmoothStroke(ctx, stroke, strokeWidth)
    }

    if (activeStroke && predictedPoints.length > 0) {
      drawSmoothStroke(ctx, [...activeStroke, ...predictedPoints], strokeWidth)
    }
  }, [drawGuideLines])

  const requestRender = useCallback(() => {
    if (renderFrameRef.current !== null) return

    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null
      renderCanvas()

      // Prediction points are a one-frame preview and never enter strokesRef.
      if (predictedPointsRef.current.length > 0) {
        predictedPointsRef.current = []
        requestRenderRef.current()
      }
    })
  }, [renderCanvas])

  useEffect(() => {
    requestRenderRef.current = requestRender
  }, [requestRender])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    strokesRef.current = []
    activeStrokeRef.current = null
    predictedPointsRef.current = []
    requestRender()
    hasStrokes.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setCandidates([])
    setRecognizing(false)
  }, [requestRender, setCandidates])

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

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d', { desynchronized: true })
    if (!ctx) return

    contextRef.current = ctx
    requestRender()
  }, [requestRender])

  useEffect(() => {
    if (modelReady) return
    let cancelled = false
    preloadModel().then(() => {
      if (!cancelled) setModelReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [modelReady])

  useEffect(() => {
    initCanvas()

    const handleResize = () => initCanvas()
    window.addEventListener('resize', handleResize)

    const canvas = canvasRef.current
    if (!canvas) return

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      return {
        x: (e.clientX - rect.left) * dpr,
        y: (e.clientY - rect.top) * dpr,
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault()
      isDrawing.current = true
      canvas.setPointerCapture(e.pointerId)
      const stroke: Stroke = [getPos(e)]
      strokesRef.current.push(stroke)
      activeStrokeRef.current = stroke
      predictedPointsRef.current = []
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing.current) return
      e.preventDefault()

      const activeStroke = activeStrokeRef.current
      if (!activeStroke) return

      // Keep every coalesced point. Some browsers return an empty array, so
      // fall back to the current event in that case.
      const coalescedEvents = e.getCoalescedEvents?.() ?? []
      if (coalescedEvents.length > 0) {
        for (const ce of coalescedEvents) {
          activeStroke.push(getPos(ce))
        }
      } else {
        activeStroke.push(getPos(e))
      }

      const currentPos = getPos(e)
      const lastPoint = activeStroke[activeStroke.length - 1]
      if (!lastPoint || lastPoint.x !== currentPos.x || lastPoint.y !== currentPos.y) {
        activeStroke.push(currentPos)
      }

      const predictedEvents = e.getPredictedEvents?.() ?? []
      predictedPointsRef.current = predictedEvents.map(getPos)
      hasStrokes.current = true
      requestRender()
    }

    const handlePointerUp = () => {
      if (!isDrawing.current) return
      isDrawing.current = false

      const activeStroke = activeStrokeRef.current
      if (activeStroke && activeStroke.length < 2) {
        const strokeIndex = strokesRef.current.indexOf(activeStroke)
        if (strokeIndex >= 0) strokesRef.current.splice(strokeIndex, 1)
      }
      activeStrokeRef.current = null
      predictedPointsRef.current = []
      requestRender()

      if (hasStrokes.current) {
        startDebounceTimer()
      }
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)

    return () => {
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current)
        renderFrameRef.current = null
      }
      contextRef.current = null
    }
  }, [initCanvas, requestRender, startDebounceTimer])

  return (
    <>
      <canvas ref={canvasRef} className="draw-canvas" />
      <button className="clear-button" type="button" onClick={clearCanvas}>
        消す
      </button>
      {recognizing && (
        <div className="recognizing-indicator">
          {modelReady ? '認識中...' : '準備中…'}
        </div>
      )}
    </>
  )
}
