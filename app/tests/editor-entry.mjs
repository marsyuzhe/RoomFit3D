/** Existing expert-workflow regressions enter through the real first-run home. */
export async function enterEditor(page){
 await page.locator('[data-roomfit-home],[data-roomfit-canvas]').first().waitFor();
 if(await page.locator('[data-roomfit-home]').isVisible()){
  await page.getByRole('checkbox',{name:/下次直接进入编辑器|Open the editor directly next time/}).check();
  await page.getByRole('button',{name:/^(直接进入编辑器|Go to editor)$/}).click();
 }
}

