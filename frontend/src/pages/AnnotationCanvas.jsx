import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Text } from 'react-konva'
import useImage from 'use-image'
import { apiGet, apiPatch, apiDelete, imageFileUrl } from '../api/client'

const BOX_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#82E0AA', '#F1948A']

function colorFor(className, allClasses) {
  const idx = allClasses.indexOf(className)
  return BOX_COLORS[idx % BOX_COLORS.length]
}

function predToRect(pred, imgW, imgH) {
  return {
    x: pred.cx * imgW,
    y: pred.cy * imgH,
    width: pred.w * imgW,
    height: pred.h * imgH,
    offsetX: (pred.w * imgW) / 2,
    offsetY: (pred.h * imgH) / 2,
    rotation: pred.angle,
  }
}

function rectToPred(node, imgW, imgH) {
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  return {
    cx: node.x() / imgW,
    cy: node.y() / imgH,
    w: (node.width() * scaleX) / imgW,
    h: (node.height() * scaleY) / imgH,
    angle: node.rotation(),
  }
}

function OBBBox({ box, isSelected, onSelect, onUpdate, imgW, imgH, color, inactive }) {
  const rectRef = useRef()
  const trRef = useRef()

  useEffect(() => {
    if (isSelected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected])

  const props = predToRect(box, imgW, imgH)

  return (
    <>
      <Rect
        ref={rectRef}
        {...props}
        stroke={color}
        strokeWidth={isSelected ? 2.5 : 1.5}
        fill={color + '25'}
        draggable={!inactive}
        listening={!inactive}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={e => {
          onUpdate({ ...box, cx: e.target.x() / imgW, cy: e.target.y() / imgH })
          e.target.scaleX(1); e.target.scaleY(1)
        }}
        onTransformEnd={() => {
          const node = rectRef.current
          onUpdate({ ...box, ...rectToPred(node, imgW, imgH) })
          node.scaleX(1); node.scaleY(1)
        }}
      />
      <Text
        x={props.x - props.offsetX}
        y={props.y - props.offsetY - 16}
        text={box.class_name}
        fontSize={11}
        fill={color}
        listening={false}
      />
      {isSelected && !inactive && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          boundBoxFunc={(old, newBox) => (newBox.width < 10 || newBox.height < 10 ? old : newBox)}
        />
      )}
    </>
  )
}

export default function AnnotationCanvas() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [task, setTask] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [imgUrl, setImgUrl] = useState(null)
  const [stageSize, setStageSize] = useState({ w: 900, h: 600 })
  const [imgDims, setImgDims] = useState({ w: 1, h: 1 })
  const [saving, setSaving] = useState(false)
  const containerRef = useRef()
  const stageRef = useRef()

  // Draw mode state
  const [drawMode, setDrawMode] = useState(false)
  const [newBoxClass, setNewBoxClass] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [drawRect, setDrawRect] = useState(null)
  const [batchClasses, setBatchClasses] = useState([])

  const siblingTaskIds = location.state?.siblingTaskIds || []
  const currentIndex = location.state?.currentIndex ?? siblingTaskIds.indexOf(parseInt(taskId))
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < siblingTaskIds.length - 1

  const [konvaImg] = useImage(imgUrl, 'anonymous')

  useEffect(() => {
    async function load() {
      const t = await apiGet(`/tasks/${taskId}`)
      setTask(t)

      // Fetch batch-wide class list for the draw-box dropdown
      const img = await apiGet(`/images/${t.image_id}`)
      apiGet(`/batches/${img.batch_id}/classes`).then(setBatchClasses).catch(() => {})

      if (t.annotations_json) {
        try {
          const saved = JSON.parse(t.annotations_json)
          setBoxes(saved.map((b, i) => ({ ...b, _id: i })))
          setImgUrl(imageFileUrl(t.image_id))
          return
        } catch {}
      }
      const preds = await apiGet(`/tasks/${taskId}/predictions`)
      const loaded = preds.map((p, i) => ({
        _id: i,
        class_name: p.class_name,
        cx: p.cx, cy: p.cy,
        w: p.w, h: p.h,
        angle: p.angle,
        confidence: p.confidence,
      }))
      setBoxes(loaded)
      setImgUrl(imageFileUrl(t.image_id))
    }
    load()
  }, [taskId])

  useEffect(() => {
    if (!konvaImg || !containerRef.current) return
    const containerW = containerRef.current.offsetWidth
    const containerH = window.innerHeight - 120
    const scaleW = containerW / konvaImg.width
    const scaleH = containerH / konvaImg.height
    const scale = Math.min(scaleW, scaleH)
    const w = konvaImg.width * scale
    const h = konvaImg.height * scale
    setStageSize({ w, h })
    setImgDims({ w, h })
  }, [konvaImg])

  // Set default class when draw mode activates
  useEffect(() => {
    if (drawMode && !newBoxClass) {
      const first = batchClasses[0] || allClasses[0]
      if (first) setNewBoxClass(first)
    }
  }, [drawMode, batchClasses])

  const allClasses = [...new Set(boxes.map(b => b.class_name))]

  function updateBox(updated) {
    setBoxes(prev => prev.map(b => b._id === updated._id ? updated : b))
  }

  function deleteSelected() {
    if (selectedId === null) return
    setBoxes(prev => prev.filter(b => b._id !== selectedId))
    setSelectedId(null)
  }

  function goToSibling(idx) {
    const newTaskId = siblingTaskIds[idx]
    navigate(`/annotate/${newTaskId}`, { state: { siblingTaskIds, currentIndex: idx } })
  }

  function toggleDrawMode() {
    setDrawMode(prev => !prev)
    setDrawing(false)
    setDrawRect(null)
    setSelectedId(null)
  }

  // Stage mouse handlers
  function handleMouseDown(e) {
    if (!drawMode) {
      if (e.target === e.target.getStage() || e.target.getClassName() === 'Image') {
        setSelectedId(null)
      }
      return
    }
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    setDrawing(true)
    setDrawStart(pos)
    setDrawRect({ x: pos.x, y: pos.y, width: 0, height: 0 })
  }

  function handleMouseMove(e) {
    if (!drawMode || !drawing || !drawStart) return
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    setDrawRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      width: Math.abs(pos.x - drawStart.x),
      height: Math.abs(pos.y - drawStart.y),
    })
  }

  function handleMouseUp(_e) {
    if (!drawMode || !drawing || !drawRect) return
    setDrawing(false)

    const { x, y, width, height } = drawRect
    if (width < 8 || height < 8) {
      setDrawRect(null)
      return
    }

    const className = newBoxClass.trim() || batchClasses[0] || allClasses[0] || 'object'
    const newBox = {
      _id: Date.now(),
      class_name: className,
      cx: (x + width / 2) / imgDims.w,
      cy: (y + height / 2) / imgDims.h,
      w: width / imgDims.w,
      h: height / imgDims.h,
      angle: 0,
      confidence: 1,
    }

    setBoxes(prev => [...prev, newBox])
    setSelectedId(newBox._id)
    setDrawRect(null)
    // Stay in draw mode so user can draw more boxes — press Escape or click button to exit
  }

  async function saveAndComplete(goNext = false) {
    if (task?.status === 'completed') {
      const confirmed = window.confirm(
        'This task is already marked complete. Do you want to replace the saved annotations with your current changes?'
      )
      if (!confirmed) return
    }
    setSaving(true)
    try {
      const annotations = boxes.map(({ _id, ...rest }) => rest)
      await apiPatch(`/tasks/${taskId}`, {
        status: 'completed',
        annotations_json: JSON.stringify(annotations),
      })
      if (goNext && hasNext) {
        goToSibling(currentIndex + 1)
      } else {
        navigate('/queue')
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function skip() {
    await apiPatch(`/tasks/${taskId}`, { status: 'skipped' })
    if (hasNext) {
      goToSibling(currentIndex + 1)
    } else {
      navigate('/queue')
    }
  }

  async function deleteImage() {
    if (!task) return
    if (!window.confirm('Delete this image from the batch? This cannot be undone.')) return
    try {
      await apiDelete(`/images/${task.image_id}`)
      if (hasNext) {
        goToSibling(currentIndex + 1)
      } else if (hasPrev) {
        goToSibling(currentIndex - 1)
      } else {
        navigate('/queue')
      }
    } catch (err) {
      alert(err.message)
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setDrawMode(false); setDrawing(false); setDrawRect(null) }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
      if (e.key === 'ArrowRight' && hasNext) goToSibling(currentIndex + 1)
      if (e.key === 'ArrowLeft' && hasPrev) goToSibling(currentIndex - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, boxes, currentIndex, siblingTaskIds, drawMode])

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/queue')} className="text-gray-400 hover:text-white text-sm">← Back</button>
          <span className="text-white text-sm font-medium">Task #{taskId}</span>
          {task && <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>{task.status}</span>}
        </div>

        {/* Prev / Next navigation */}
        {siblingTaskIds.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToSibling(currentIndex - 1)}
              disabled={!hasPrev}
              className="text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed px-3 py-1 rounded border border-gray-700 hover:border-gray-500 text-sm transition"
            >
              ‹ Prev
            </button>
            <span className="text-xs text-gray-500 px-2">{currentIndex + 1} / {siblingTaskIds.length}</span>
            <button
              onClick={() => goToSibling(currentIndex + 1)}
              disabled={!hasNext}
              className="text-gray-300 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed px-3 py-1 rounded border border-gray-700 hover:border-gray-500 text-sm transition"
            >
              Next ›
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {boxes.length} boxes · {drawMode ? 'draw mode — click & drag' : selectedId !== null ? '1 selected (Del to remove)' : 'click to select'}
          </span>

          {/* Draw mode toggle */}
          <button
            onClick={toggleDrawMode}
            className={`text-sm px-3 py-1 rounded border transition ${drawMode ? 'bg-blue-600 border-blue-500 text-white' : 'text-blue-400 border-blue-900 hover:border-blue-600 hover:text-blue-300'}`}
          >
            ✏ {drawMode ? 'Drawing...' : 'Draw Box'}
          </button>

          <button onClick={deleteImage} className="text-sm text-red-500 hover:text-red-400 px-3 py-1 rounded border border-red-900 hover:border-red-700 transition" title="Delete this image from the batch">🗑 Delete Image</button>
          <button onClick={skip} className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded border border-gray-700 hover:border-gray-500 transition">Skip</button>
          <button
            onClick={() => saveAndComplete(true)}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded transition"
          >
            {saving ? 'Saving...' : hasNext ? '✓ Done & Next' : '✓ Mark Complete'}
          </button>
        </div>
      </header>

      {/* Draw mode toolbar */}
      {drawMode && (
        <div className="bg-blue-950 border-b border-blue-900 px-4 py-2 flex items-center gap-3 shrink-0">
          <span className="text-xs text-blue-300 font-medium">Class for new box:</span>
          <input
            list="class-options"
            value={newBoxClass}
            onChange={e => setNewBoxClass(e.target.value)}
            placeholder="Type or select class name"
            className="bg-blue-900 border border-blue-700 text-white text-sm rounded px-2 py-0.5 focus:outline-none focus:border-blue-400 w-48"
            autoFocus
          />
          <datalist id="class-options">
            {(batchClasses.length > 0 ? batchClasses : allClasses).map(cls => (
              <option key={cls} value={cls} />
            ))}
          </datalist>
          <span className="text-xs text-blue-400">Click and drag on the image to draw · Press Esc to exit</span>
        </div>
      )}

      {/* Legend */}
      {allClasses.length > 0 && !drawMode && (
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-4 shrink-0">
          {allClasses.map((cls, i) => (
            <div key={cls} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: BOX_COLORS[i % BOX_COLORS.length] }} />
              <span className="text-xs text-gray-300">{cls}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        {konvaImg ? (
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            style={{ cursor: drawMode ? 'crosshair' : 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <Layer>
              <KonvaImage image={konvaImg} width={imgDims.w} height={imgDims.h} />
              {boxes.map(box => (
                <OBBBox
                  key={box._id}
                  box={box}
                  isSelected={selectedId === box._id}
                  onSelect={() => { if (!drawMode) setSelectedId(box._id) }}
                  onUpdate={updateBox}
                  imgW={imgDims.w}
                  imgH={imgDims.h}
                  color={colorFor(box.class_name, allClasses)}
                  inactive={drawMode}
                />
              ))}
              {/* Drawing preview rect */}
              {drawMode && drawRect && drawRect.width > 0 && drawRect.height > 0 && (
                <Rect
                  x={drawRect.x}
                  y={drawRect.y}
                  width={drawRect.width}
                  height={drawRect.height}
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  fill="#60a5fa22"
                  dash={[6, 3]}
                  listening={false}
                />
              )}
            </Layer>
          </Stage>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            {imgUrl ? 'Loading image...' : 'Loading task...'}
          </div>
        )}
      </div>
    </div>
  )
}