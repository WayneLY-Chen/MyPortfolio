import { API_URL } from '../config/api'
const BASE_URL = API_URL

export async function fetchProjects() {
  const res = await fetch(`${BASE_URL}/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  const data = await res.json()
  return data.data || []
}

export async function fetchProfile() {
  const res = await fetch(`${BASE_URL}/profile`)
  if (!res.ok) throw new Error('Failed to fetch profile')
  const data = await res.json()
  return data.data || {}
}

export async function fetchBlog() {
  const res = await fetch(`${BASE_URL}/blog`)
  if (!res.ok) throw new Error('Failed to fetch blog')
  const data = await res.json()
  return data.data || []
}
