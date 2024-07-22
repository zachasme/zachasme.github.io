import { ref } from './vue.js'
export default {
  setup() {
    const today = new Date().toISOString().split('T')[0]
    const value = ref(today)

    return {
      value
    }
  },
  template: `
 {{ value }}
  <input type="date" :value />
  `
}