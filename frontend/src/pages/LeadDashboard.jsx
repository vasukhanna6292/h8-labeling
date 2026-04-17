import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiDelete, createInvite, getCurrentModel, uploadModel, uploadImages, downloadExport } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const BOX_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#82E0AA', '#F1948A']

export default function LeadDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [batches, setBatches] = useState([])
  const [users, setUsers] = useState([])
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [images, setImages] = useState([])
  const [progress, setProgress] = useState(null)
  const [newBatchName, setNewBatchName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedAnnotators, setSelectedAnnotators] = useState([])
  const [annotatorStats, setAnnotatorStats] = useState([])
  const [msg, setMsg] = useState('')
  const [newlyUploadedCount, setNewlyUploadedCount] = useState(0)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [modelInfo, setModelInfo] = useState(null)
  const [modelUploadProgress, setModelUploadProgress] = useState(null) // null | 0-100
  const [modelMsg, setModelMsg] = useState('')
  const [batchClasses, setBatchClasses] = useState([])
  const [newClassName, setNewClassName] = useState('')
  const [yamlUploading, setYamlUploading] = useState(false)
  const modelFileRef = useRef()
  const fileRef = useRef()
  const yamlFileRef = useRef()

  useEffect(() => {
    apiGet('/batches/').then(setBatches)
    apiGet('/users/').then(u => setUsers(u.filter(x => x.role === 'annotator')))
    getCurrentModel().then(setModelInfo).catch(() => {})
  }, [])

  // Poll inference progress every 5s while batch is processing
  useEffect(() => {
    if (!selectedBatch || selectedBatch.status !== 'processing') return
    const interval = setInterval(async () => {
      const [b, imgs] = await Promise.all([
        apiGet(`/batches/${selectedBatch.id}`),
        apiGet(`/images/batches/${selectedBatch.id}`),
      ])
      setImages(imgs)
      setSelectedBatch(b)
      setBatches(prev => prev.map(x => x.id === b.id ? b : x))
      if (b.status !== 'processing') {
        clearInterval(interval)
        setNewlyUploadedCount(0)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [selectedBatch?.id, selectedBatch?.status])

  async function loadBatch(batch) {
    setSelectedBatch(batch)
    setMsg('')
    setNewlyUploadedCount(0)
    setBatchClasses([])
    const [imgs, prog, stats, classes] = await Promise.all([
      apiGet(`/images/batches/${batch.id}`),
      apiGet(`/batches/${batch.id}/progress`),
      apiGet(`/batches/${batch.id}/annotator-stats`),
      apiGet(`/batches/${batch.id}/classes`).catch(() => []),
    ])
    setImages(imgs)
    setProgress(prog)
    setAnnotatorStats(stats)
    setBatchClasses(classes)
    setSelectedAnnotators([])
  }

  async function createBatch(e) {
    e.preventDefault()
    if (!newBatchName.trim()) return
    const b = await apiPost('/batches/', { name: newBatchName.trim() })
    setBatches(prev => [...prev, b])
    setNewBatchName('')
    loadBatch(b)
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length || !selectedBatch) return
    setUploading(true)
    setMsg('')
    try {
      await uploadImages(selectedBatch.id, files, (done, total) => {
        setMsg(`Uploading... ${done}/${total}`)
      })
      const imgs = await apiGet(`/images/batches/${selectedBatch.id}`)
      setImages(imgs)
      setNewlyUploadedCount(prev => prev + files.length)
      setMsg(`✓ ${files.length} image(s) uploaded — run inference before assigning`)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  async function triggerInference() {
    try {
      await apiPost(`/batches/${selectedBatch.id}/trigger-inference`)
      setMsg('✓ Inference queued — check back in a moment')
      const b = await apiGet(`/batches/${selectedBatch.id}`)
      setSelectedBatch(b)
      setBatches(prev => prev.map(x => x.id === b.id ? b : x))
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
  }

  async function assignTasks() {
    setAssigning(true)
    setMsg('')
    try {
      const body = selectedAnnotators.length > 0
        ? { annotator_ids: selectedAnnotators }
        : {}
      const result = await apiPost(`/batches/${selectedBatch.id}/assign`, body)
      setMsg(`✓ ${result.tasks_created} tasks assigned across ${result.annotators_count} annotators`)
      const [prog, stats] = await Promise.all([
        apiGet(`/batches/${selectedBatch.id}/progress`),
        apiGet(`/batches/${selectedBatch.id}/annotator-stats`),
      ])
      setProgress(prog)
      setAnnotatorStats(stats)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setAssigning(false)
    }
  }

  async function handleExport(completedOnly = false) {
    setExporting(true)
    setMsg('')
    try {
      await downloadExport(selectedBatch.id, completedOnly)
      setMsg(`✓ Export downloaded (${completedOnly ? 'completed only' : 'all images'})`)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  async function generateInvite() {
    setInviteLoading(true)
    setInviteLink('')
    try {
      const res = await createInvite()
      const url = `${window.location.origin}/invite/${res.token}`
      setInviteLink(url)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleModelUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setModelUploadProgress(0)
    setModelMsg('')
    try {
      const result = await uploadModel(file, (loaded, total) => {
        setModelUploadProgress(Math.round((loaded / total) * 100))
      })
      setModelMsg(`✓ Model uploaded (${result.size_mb} MB) — workers will reload on next inference`)
      const info = await getCurrentModel()
      setModelInfo(info)
    } catch (err) {
      setModelMsg(`Error: ${err.message}`)
    } finally {
      setModelUploadProgress(null)
      modelFileRef.current.value = ''
    }
  }

  async function handleYamlUpload(e) {
    const file = e.target.files[0]
    if (!file || !selectedBatch) return
    setYamlUploading(true)
    setMsg('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/batches/${selectedBatch.id}/upload-yaml`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Upload failed') }
      const data = await res.json()
      setBatchClasses(data.classes)
      setMsg(`✓ YAML uploaded — ${data.classes.length} classes loaded: ${data.classes.join(', ')}`)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    } finally {
      setYamlUploading(false)
      yamlFileRef.current.value = ''
    }
  }

  async function addClass() {
    if (!newClassName.trim() || !selectedBatch) return
    const updated = [...batchClasses, newClassName.trim()]
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/batches/${selectedBatch.id}/classes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Failed to update classes')
      const data = await res.json()
      setBatchClasses(data.classes)
      setNewClassName('')
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
  }

  async function removeClass(cls) {
    if (!selectedBatch) return
    const updated = batchClasses.filter(c => c !== cls)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/batches/${selectedBatch.id}/classes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Failed to update classes')
      const data = await res.json()
      setBatchClasses(data.classes)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
  }

  async function deleteImage(img) {
    if (!confirm(`Delete "${img.file_path.split('/').pop()}"? This will also remove its predictions and task.`)) return
    try {
      await apiDelete(`/images/${img.id}`)
      setImages(prev => prev.filter(i => i.id !== img.id))
      setMsg(`✓ Image deleted`)
      const prog = await apiGet(`/batches/${selectedBatch.id}/progress`)
      setProgress(prog)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
  }

  async function deleteBatch(batch) {
    if (!confirm(`Delete "${batch.name}"? This will remove all tasks and cannot be undone.`)) return
    try {
      await apiDelete(`/batches/${batch.id}`)
      setBatches(prev => prev.filter(b => b.id !== batch.id))
      if (selectedBatch?.id === batch.id) setSelectedBatch(null)
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  function toggleAnnotator(id) {
    setSelectedAnnotators(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function removeAnnotator(u) {
    if (!confirm(`Remove ${u.name || u.email}? Their incomplete tasks will be deleted. Export first if you need their completed work.`)) return
    try {
      await apiDelete(`/users/${u.id}`)
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setSelectedAnnotators(prev => prev.filter(id => id !== u.id))
      setMsg(`✓ ${u.name || u.email} removed`)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">H8 Labeling <span className="text-blue-400 text-sm font-normal ml-2">Lead</span></h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button onClick={() => { logout(); navigate('/login') }} className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-52px)]">
        {/* Sidebar — batch list */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <form onSubmit={createBatch} className="flex gap-2">
              <input
                value={newBatchName}
                onChange={e => setNewBatchName(e.target.value)}
                placeholder="New batch name"
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded">+</button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto">
            {batches.map(b => (
              <div
                key={b.id}
                className={`flex items-center border-b border-gray-800 hover:bg-gray-800 transition group ${selectedBatch?.id === b.id ? 'bg-gray-800 border-l-2 border-l-blue-500' : ''}`}
              >
                <button onClick={() => loadBatch(b)} className="flex-1 text-left px-4 py-3">
                  <div className="text-sm font-medium text-white truncate">{b.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <StatusDot status={b.status} />
                    {b.status}
                  </div>
                  {b.created_at && (
                    <div className="text-xs text-gray-600 mt-0.5">{new Date(b.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  )}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteBatch(b) }}
                  className="opacity-0 group-hover:opacity-100 px-3 py-1 text-gray-500 hover:text-red-400 transition text-xs"
                  title="Delete batch"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedBatch ? (
            <div className="flex items-center justify-center h-full text-gray-500">Select or create a batch</div>
          ) : (
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{selectedBatch.name}</h2>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(selectedBatch.status)}`}>{selectedBatch.status}</span>
              </div>

              {msg && <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200">{msg}</div>}

              {/* Progress */}
              {progress && progress.total_tasks > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Annotation Progress</span>
                    <span className="text-white font-medium">{progress.percent_complete}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress.percent_complete}%` }} />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>✓ {progress.completed} completed</span>
                    <span>◷ {progress.in_progress} in progress</span>
                    <span>○ {progress.pending} pending</span>
                  </div>
                </div>
              )}

              {/* Upload */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Upload Images</h3>
                <div className="flex items-center gap-3">
                  <input ref={fileRef} type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-white px-4 py-2 rounded-lg transition">
                    {uploading ? 'Uploading...' : 'Choose Files'}
                  </label>
                  <span className="text-sm text-gray-400">{images.length} image(s) in batch</span>
                </div>
              </div>

              {/* Classes */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Classes</h3>
                <p className="text-xs text-gray-500 mb-3">Upload a YOLO data.yaml to auto-load classes, or add them manually. Classes define what annotators can label in this batch.</p>

                {/* YAML upload */}
                <div className="flex items-center gap-3 mb-4">
                  <input ref={yamlFileRef} type="file" accept=".yaml,.yml" onChange={handleYamlUpload} className="hidden" id="yaml-upload" />
                  <label htmlFor="yaml-upload" className={`cursor-pointer bg-blue-700 hover:bg-blue-600 border border-blue-600 text-sm text-white px-4 py-2 rounded-lg transition ${yamlUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {yamlUploading ? 'Uploading...' : '📄 Upload data.yaml'}
                  </label>
                  <span className="text-xs text-gray-500">Auto-detects class names from YOLO YAML format</span>
                </div>

                {/* Current classes */}
                {batchClasses.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {batchClasses.map((cls, i) => (
                      <span key={i} className="flex items-center gap-1 bg-gray-800 border border-gray-700 text-xs text-gray-200 px-2 py-1 rounded-full">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: BOX_COLORS[i % BOX_COLORS.length] }} />
                        {cls}
                        <button onClick={() => removeClass(cls)} className="ml-1 text-gray-500 hover:text-red-400 transition">✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {batchClasses.length === 0 && (
                  <p className="text-xs text-yellow-600 mb-3">⚠ No classes defined. Upload a YAML or add manually.</p>
                )}

                {/* Add class manually */}
                <div className="flex gap-2">
                  <input
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addClass()}
                    placeholder="Add class name..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={addClass} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-1.5 rounded transition">+ Add</button>
                </div>
              </div>

              {/* Inference */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Inference</h3>
                <button
                  onClick={triggerInference}
                  disabled={selectedBatch.status === 'processing'}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
                >
                  {selectedBatch.status === 'processing' ? '⏳ Running...' : '▶ Run YOLOv11 Inference'}
                </button>
                {selectedBatch.status === 'processing' && (() => {
                  const inferenced = images.filter(i => i.status === 'inferenced').length
                  const total = images.length
                  const pct = total > 0 ? Math.round((inferenced / total) * 100) : 0
                  return (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Inference Progress</span>
                        <span>{inferenced} / {total} images ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className="bg-purple-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Assign tasks */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Assign Tasks to Annotators</h3>
                {users.length === 0 ? (
                  <p className="text-sm text-gray-500">No annotators registered yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {users.map(u => (
                        <div key={u.id} className="flex items-center gap-2 group">
                          <input
                            type="checkbox"
                            checked={selectedAnnotators.includes(u.id)}
                            onChange={() => toggleAnnotator(u.id)}
                            className="accent-blue-500 cursor-pointer"
                          />
                          <span className="text-sm text-gray-300 truncate flex-1">{u.name || u.email}</span>
                          <button
                            onClick={() => removeAnnotator(u)}
                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition"
                            title="Remove annotator"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={assignTasks}
                        disabled={assigning || selectedBatch.status !== 'done' || newlyUploadedCount > 0}
                        title={newlyUploadedCount > 0 ? `${newlyUploadedCount} new image(s) need inference before assigning` : selectedBatch.status !== 'done' ? 'Run inference first' : ''}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition"
                      >
                        {assigning ? 'Assigning...' : selectedAnnotators.length === 0 ? '⚡ Assign to All Annotators' : `⚡ Assign to Selected (${selectedAnnotators.length})`}
                      </button>
                    </div>
                    {newlyUploadedCount > 0 && (
                      <p className="text-xs text-yellow-500 mt-2">⚠ {newlyUploadedCount} newly uploaded image(s) — run inference before assigning.</p>
                    )}
                    {newlyUploadedCount === 0 && selectedBatch.status !== 'done' && (
                      <p className="text-xs text-yellow-600 mt-2">⚠ Run inference first. Assign unlocks when batch status is "done".</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Images are split equally via round-robin. Already-assigned images are skipped.</p>
                  </>
                )}
              </div>

              {/* Annotator stats */}
              {annotatorStats.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Annotator Progress</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-800">
                        <th className="text-left pb-2">Annotator</th>
                        <th className="text-center pb-2">Assigned</th>
                        <th className="text-center pb-2">Completed</th>
                        <th className="text-center pb-2">Pending</th>
                        <th className="text-right pb-2">Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annotatorStats.map(s => {
                        const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0
                        return (
                          <tr key={s.user_id} className="border-b border-gray-800 last:border-0">
                            <td className="py-2 text-gray-300 truncate max-w-[120px]">{s.name || s.email}</td>
                            <td className="py-2 text-center text-gray-400">{s.total}</td>
                            <td className="py-2 text-center text-green-400">{s.completed}</td>
                            <td className="py-2 text-center text-gray-400">{s.pending}</td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-gray-700 rounded-full h-1.5">
                                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-gray-400 w-8">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Invite Annotators */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Invite Annotators</h3>
                <p className="text-xs text-gray-500 mb-3">Generate a one-time link (48h expiry). Share it via WhatsApp/email — annotator clicks it, creates their account, and appears in your annotator list automatically.</p>
                <button
                  onClick={generateInvite}
                  disabled={inviteLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
                >
                  {inviteLoading ? 'Generating...' : '🔗 Generate Invite Link'}
                </button>
                {inviteLink && (
                  <div className="mt-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Copy and send this link:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-green-300 break-all">{inviteLink}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                        className="shrink-0 text-xs text-gray-400 hover:text-white border border-gray-600 px-2 py-1 rounded transition"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-yellow-600 mt-1">⚠ Single-use. Expires in 48 hours.</p>
                  </div>
                )}
              </div>

              {/* Model Management */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Model Management</h3>
                {modelInfo && (
                  <div className="mb-3 text-xs text-gray-400 space-y-0.5">
                    <p>Current model: <span className="text-gray-200">{modelInfo.size_mb} MB</span></p>
                    <p>Last updated: <span className="text-gray-200">{new Date(modelInfo.last_modified).toLocaleString()}</span></p>
                    <p>Version: <span className="text-gray-500 font-mono">{modelInfo.version}</span></p>
                  </div>
                )}
                <input ref={modelFileRef} type="file" accept=".pt" onChange={handleModelUpload} className="hidden" id="model-upload" />
                <label
                  htmlFor="model-upload"
                  className={`cursor-pointer inline-block bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-white px-4 py-2 rounded-lg transition ${modelUploadProgress !== null ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {modelUploadProgress !== null ? `Uploading... ${modelUploadProgress}%` : '⬆ Upload New best.pt'}
                </label>
                {modelUploadProgress !== null && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${modelUploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Uploading model file... {modelUploadProgress}%</p>
                  </div>
                )}
                {modelMsg && <p className="text-xs mt-2 text-gray-300">{modelMsg}</p>}
                <p className="text-xs text-gray-600 mt-2">Workers reload the new model automatically on their next inference run — no restart needed.</p>
              </div>

              {/* Export */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Export Dataset (YOLO OBB)</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleExport(false)}
                    disabled={exporting}
                    className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
                  >
                    {exporting ? '⏳ Exporting...' : '⬇ Download All'}
                  </button>
                  <button
                    onClick={() => handleExport(true)}
                    disabled={exporting}
                    className="bg-teal-800 hover:bg-teal-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition"
                  >
                    {exporting ? '⏳ Exporting...' : '⬇ Completed Only'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  All: every inferenced image (reviewed boxes where available, raw predictions otherwise).<br/>
                  Completed Only: images marked as done by annotators, using their reviewed boxes.
                </p>
              </div>

              {/* Image list */}
              {images.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Images ({images.length})</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {images.map(img => (
                      <div key={img.id} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-gray-800 group">
                        <span className="text-gray-300 truncate flex-1">{img.file_path.split('/').pop()}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(img.status)}`}>{img.status}</span>
                          <button
                            onClick={() => deleteImage(img)}
                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition text-xs px-1"
                            title="Delete image"
                          >🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function StatusDot({ status }) {
  const colors = { pending: 'bg-gray-400', processing: 'bg-yellow-400', done: 'bg-green-400' }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-gray-400'}`} />
}

function statusColor(status) {
  const map = {
    pending: 'bg-gray-700 text-gray-300',
    processing: 'bg-yellow-900 text-yellow-300',
    done: 'bg-green-900 text-green-300',
    uploaded: 'bg-gray-700 text-gray-300',
    inferenced: 'bg-blue-900 text-blue-300',
    annotated: 'bg-green-900 text-green-300',
    completed: 'bg-green-900 text-green-300',
    in_progress: 'bg-yellow-900 text-yellow-300',
  }
  return map[status] || 'bg-gray-700 text-gray-300'
}
