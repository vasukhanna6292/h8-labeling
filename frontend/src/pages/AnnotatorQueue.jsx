import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiDelete } from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function AnnotatorQueue() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const t = await apiGet('/tasks/my-queue')
      setTasks(t)
      setLoading(false)
    }
    load()
  }, [])

  // Group tasks by batch_id (now comes directly from the task)
  const batchGroups = {}
  tasks.forEach(task => {
    const batchId = task.batch_id ?? 0
    if (!batchGroups[batchId]) batchGroups[batchId] = []
    batchGroups[batchId].push(task)
  })

  const totalCompleted = tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length

  function openTask(task, batchTasks) {
    const siblingTaskIds = batchTasks.map(t => t.id)
    const currentIndex = siblingTaskIds.indexOf(task.id)
    navigate(`/annotate/${task.id}`, { state: { siblingTaskIds, currentIndex } })
  }

  async function deleteTask(task) {
    if (!window.confirm(`Are you sure you want to delete Task #${task.id}? This cannot be undone.`)) return
    try {
      await apiDelete(`/tasks/${task.id}`)
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  async function deleteBatchTasks(batchId, batchName, count) {
    if (!window.confirm(`Delete all ${count} tasks for "${batchName}"? This cannot be undone.`)) return
    try {
      await apiDelete(`/tasks/my-batch/${batchId}`)
      setTasks(prev => prev.filter(t => t.batch_id !== batchId))
    } catch (err) {
      alert(`Error: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">H8 Labeling <span className="text-green-400 text-sm font-normal ml-2">Annotator</span></h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button onClick={() => { logout(); navigate('/login') }} className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {loading ? (
          <p className="text-gray-400 text-center mt-12">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-gray-400 text-lg">No tasks assigned yet.</p>
            <p className="text-gray-600 text-sm mt-2">Ask your lead to assign images.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-6 text-sm text-gray-400">
              <span>{tasks.length - totalCompleted} pending</span>
              <span>·</span>
              <span>{totalCompleted} done</span>
              <span>·</span>
              <span>{tasks.length > 0 ? Math.round(totalCompleted / tasks.length * 100) : 0}% complete</span>
            </div>

            <div className="space-y-4">
              {Object.entries(batchGroups).map(([batchId, batchTasks]) => {
                const batchName = batchTasks[0]?.batch_name || `Batch #${batchId}`
                const completed = batchTasks.filter(t => t.status === 'completed' || t.status === 'skipped').length
                const total = batchTasks.length
                const pct = total > 0 ? Math.round(completed / total * 100) : 0
                const pending = batchTasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
                const done = batchTasks.filter(t => t.status === 'completed' || t.status === 'skipped')

                return (
                  <div key={batchId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    {/* Batch header with progress */}
                    <div className="px-4 py-3 border-b border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-white">{batchName}</h2>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{completed}/{total} complete</span>
                          <button
                            onClick={() => deleteBatchTasks(Number(batchId), batchName, total)}
                            className="text-xs text-gray-600 hover:text-red-400 transition"
                            title="Delete all tasks for this batch"
                          >
                            🗑 Delete batch tasks
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                        <span>✓ {completed} done</span>
                        <span>○ {pending.length} remaining</span>
                        <span>{pct}%</span>
                      </div>
                    </div>

                    {/* Pending tasks */}
                    {pending.length > 0 && (
                      <div className="divide-y divide-gray-800">
                        {pending.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onClick={() => openTask(task, batchTasks)}
                            onDelete={() => deleteTask(task)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Completed tasks — collapsible */}
                    {done.length > 0 && (
                      <details className="border-t border-gray-800">
                        <summary className="px-4 py-2 text-xs text-gray-500 cursor-pointer hover:text-gray-300 select-none">
                          ▸ {done.length} completed — click to review
                        </summary>
                        <div className="divide-y divide-gray-800">
                          {done.map(task => (
                            <TaskRow
                              key={task.id}
                              task={task}
                              onClick={() => openTask(task, batchTasks)}
                              onDelete={() => deleteTask(task)}
                            />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TaskRow({ task, onClick, onDelete }) {
  const STATUS_COLOR = {
    pending: 'bg-gray-700 text-gray-300',
    in_progress: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-green-900 text-green-300',
    skipped: 'bg-gray-800 text-gray-500',
  }

  return (
    <div className="flex items-center group hover:bg-gray-800 transition">
      <button
        onClick={onClick}
        className="flex-1 text-left px-4 py-2.5 flex items-center justify-between"
      >
        <div>
          <p className="text-sm text-white group-hover:text-blue-300 transition">
            {task.file_name || `Image #${task.image_id}`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Task #{task.id}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[task.status]}`}>
          {task.status}
        </span>
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 px-3 py-1 text-gray-600 hover:text-red-400 transition text-xs shrink-0"
        title="Delete task"
      >
        🗑
      </button>
    </div>
  )
}