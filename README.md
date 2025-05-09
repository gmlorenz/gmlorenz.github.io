# Fixpoints Manual Extractor

This is a web-based tool designed to help users manually extract and calculate "fixpoints" based on quantities entered for different categories. It provides features for project management, saving, loading, and exporting data.

## Key Features:

* **Dynamic Category Input:** Generates input fields for 9 categories (CAT 1 to CAT 9) where users can enter quantities.
* **Real-time Calculation:** Automatically calculates the total points for each category and a grand total as the quantities are entered. The calculation is influenced by the selected project size and the (IR) option.
* **Project Size Selection:** Allows users to choose between "3IN" and "9IN" project sizes, which affects the point value per unit for each category.
* **IR Multiplier:** An "(IR)" checkbox that, when checked, applies a multiplier of 2 to the category totals.
* **Manual Fixpoint Extraction:** A "Paste Fixpoints" textarea where users can paste a list of numbers (separated by whitespace). Clicking the "Extract Fixpoints" button will attempt to automatically populate the quantity fields for the first 9 categories based on these pasted numbers. Each instance of a number (1-9) in the pasted text increments the corresponding category's quantity.
* **Project Naming:** Users can enter a name for their current project.
* **Saving Projects:** The "Save" button allows users to store the current project's name, category quantities, totals, selected size, IR option, and final multiplier in the browser's local storage. A warning message appears if the project name is empty.
* **Project List:** A "Projects list" textarea displays a read-only summary of all saved projects, including their name and total points.
* **Undo Save:** The "Undo" button allows users to revert the last saved project, removing it from the local storage and the displayed list. It also attempts to restore the previous project's data in the input fields.
* **Final Multiplier:** An input field where users can enter a multiplier that will be applied to the overall total of all saved projects.
* **Calculate Overall Total:** The "Calculate" button calculates the sum of the "Total Points" of all saved projects and applies the "Multiplier" before displaying the result in a pop-up window.
* **Clear Data:** The "Clear Data" button resets all input fields, clears the saved projects list, removes data from local storage, and sets the multiplier back to 1.
* **Export as JSON:** Allows users to download all saved project data as a JSON file.
* **Import from JSON:** Enables users to upload a JSON file containing previously exported project data, loading it back into the tool.
* **Save Warning:** A pop-up message appears if the user tries to save a project without entering a project name.
