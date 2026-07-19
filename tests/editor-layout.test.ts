import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('resume editor passes flex height through to the Element Plus textarea', () => {
  const view = readProjectFile('src/views/ResumeDetail.vue')
  const styles = readProjectFile('src/style.css')

  assert.match(view, /type="textarea"\s+class="fill-textarea font-mono"/)
  assert.match(styles, /\.el-textarea\.fill-textarea[\s\S]*?flex:\s*1 1 0%/)
  assert.match(styles, /\.el-textarea\.fill-textarea \.el-textarea__inner[\s\S]*?height:\s*100%/)
})

test('generated text editors have a definite full-height parent and textarea', () => {
  const view = readProjectFile('src/views/Customize.vue')
  const styles = readProjectFile('src/style.css')

  assert.equal((view.match(/class="h-full min-h-\[520px\]"/g) || []).length, 2)
  assert.equal((view.match(/class="fill-native-textarea /g) || []).length, 2)
  assert.match(styles, /\.fill-native-textarea[\s\S]*?height:\s*100%/)
})
