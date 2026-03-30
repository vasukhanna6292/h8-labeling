const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return localStorage.getItem('token')
}

function authHeaders(extra = {}) {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function request(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

export const apiGet = (path) => request('GET', path)
export const apiPost = (path, body) => request('POST', path, body)
export const apiPatch = (path, body) => request('PATCH', path, body)
export const apiDelete = (path) => request('DELETE', path)

export function imageFileUrl(imageId) {
  return `${API}/images/${imageId}/file`
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Invalid email or password')
  const data = await res.json()
  localStorage.setItem('token', data.access_token)
  return data
}

export function logout() {
  localStorage.removeItem('token')
}

export async function downloadExport(batchId, completedOnly = false) {
  const res = await fetch(`${API}/batches/${batchId}/export?completed_only=${completedOnly}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Export failed')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `batch_${batchId}_yolo_obb${completedOnly ? '_completed' : '_all'}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export async function createInvite() {
  return request('POST', '/invites/')
}

export async function validateInvite(token) {
  return request('GET', `/invites/${token}/validate`)
}

export async function registerWithInvite(token, { name, email, password }) {
  const params = new URLSearchParams({ name, email, password })
  const res = await fetch(`${API}/invites/${token}/register?${params}`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Registration failed')
  }
  return res.json()
}

export async function getCurrentModel() {
  return request('GET', '/models/current')
}

export async function uploadModel(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/models/upload`)
    const token = localStorage.getItem('token')
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else if (xhr.status === 401 || xhr.status === 403) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        reject(new Error('Session expired'))
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).detail)) }
        catch { reject(new Error('Upload failed')) }
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(formData)
  })
}

export async function uploadImages(batchId, files, onProgress) {
  const CHUNK_SIZE = 500
  let results = []
  const total = files.length

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = Array.from(files).slice(i, i + CHUNK_SIZE)
    const formData = new FormData()
    for (const file of chunk) {
      formData.append('files', file)
    }
    const res = await fetch(`${API}/images/batches/${batchId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Upload failed')
    }
    results = results.concat(await res.json())
    if (onProgress) onProgress(Math.min(i + CHUNK_SIZE, total), total)
  }
  return results
}
