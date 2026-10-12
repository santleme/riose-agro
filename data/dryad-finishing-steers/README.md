# Model evaluation of predicting enteric methane emissions in finishing steers

[https://doi.org/10.5061/dryad.qnk98sfsn](https://doi.org/10.5061/dryad.qnk98sfsn)

## Description of the data and file structure

Data are from 5 independent experiments with *Bos taurus* cattle fed an energy dense finishing diet. Emissions data were collected via Greenfeed units (C-Lock Inc, Rapid City, SD). Feed intake was collected from Smartfeed units (C-Lock Inc., Rapid City, SD). Feed composition data were determined via wet chemistry by Dairy One (Ithaca, NY). 

### File: Sup_T1_Met_Pre_Rev.pdf

**Description:** Table with models and references. 

### File: Fig_1_Met_pred.tif

**Description:** Figure with comparing Concordance Correlation Coefficient (CCC) and Root Mean Square Prediction Error (RMSPE) of evaluated models.

### File: Fig_2_Met_pred.tiff

**Description:** Figure comparing proportion of evaluated models that under and over predicted methane emissions. 

#### File: Database_09-11-2025.csv

**Description:** Independent dataset used for model evaluation

##### Variables

* Project: project code for each of the 5 independent experiments in the dataset
* Animal: unique animal id within the dataset
* Breed: breed type of the animal
* ADG_Fin: average daily gain in kg
* SMBW_Fin: Shrunk mid body weight in kg
* DMI_Fin: dry matter intake in kg
* CO2_Fin: carbon dioxide emissions in g per day
* CH4_Fin: methane emissions in g per day
* CH4_MJ_Fin: enteric methane emissions in MJ per day
* O2_Fin: oxygen consumption in g per day
* CP_%: crude protein percentage in the diet
* NDF_%: neutral detergent fiber percentage in the diet
* Hem_%: hemicellulose percentage in the diet
* ADF_%: acid detergent fiber percentage in the diet
* Lig_%: Lignin percentage in the diet
* Cel_%: Cellulose percentage in the diet
* NFC_%: Non-fiber carbohydrates percentage in the diet
* Sta_%: Starch percentage in the diet
* EE_%: Ether extract percentage in the diet
* Ash_%: Ash percentage in the diet
* Forage_%: Forage percentage in the diet
* TDN_%: total digestible nutrients percentage in the diet
* NEm_Mcalkg: net energy for maintenance density in the diet in Mcal per kg of dry matter
* NEg_Mcalkg: net energy for gain density in the diet in Mcal per kg of dry matter
* GE_Mcalkg: gross energy density in the diet in Mcal per kg of dry matter

#### File: metadata.docx

**Description:** A copy of this README

## Code/software

R code script and needed packages are provided in **Model_evaluation_syntaxis_animal.txt.** 

## Version changes

16-sept-2025: updated data in **Database_09-11-2025.csv** for data from project 2024A, due to a GreenFeed data processing error by C-Lock, Inc. 

24-feb-2026: separate metadata file metadata.docx with README information added. In variable list, CH4_MJ_Fin variable description has been added
