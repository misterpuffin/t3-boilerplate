import create from 'zustand'

interface User {
  name: string
  email: string
}

export const useUserStore = create<User>((set) => ({
  name: '',
  email: '',
  setUser: (newUser: User) => set({ ...newUser })
}))
