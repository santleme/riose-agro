# Gas flux determination and prediction of methane emissions in yearling steers under grazing conditions

Dataset DOI: [10.5061/dryad.dbrv15fg8](https://doi.org/10.5061/dryad.dbrv15fg8)

## Description of the data and file structure

Data are from four independent grazing experiments using growing *Bos taurus* cattle. Gas flux data were collected using an automated head chamber system (GreenFeed, C-Lock Inc., Rapid City, SD, USA). Body weights were whole animal full body weights collected in cattle chute. Average daily gain was calculated as final full body weight subtracted by beginning full body weight divided by the number of days between the two measurements of body weight. 
### Files and variables

#### File: Database_visits.csv

**Description:** Data file containing data from 141 steers from four independent grazing experiments. 

##### Variables

* Observation: identifier for one unique steer.
* Interval: the interval of visits including in the mean gas flux estimation. For example, interval 5 corresponds to the mean gas flux for the first 5 visits of the steer to the automated head chamber system. Interval 10 corresponds to the first 10 visits and so forth through the first 100 visits to the automated head camber system. 
* CO2: the production of carbon dioxide in grams per day.  
* CH4: the production of methane in grams per day. 
* O2: the consumption of oxygen in grams per day. 

#### File: Database_Model.csv

**Description:** data file with data from 154 steers for use in evaluating existing empirical models to predict enteric methane emissions from grazing cattle. 

##### Variables

* ID: identifier for one unique steer. 
* CO2: production of carbon dioxide in grams per day. 
* CH4: production of methane in grams per day. 
* O2: consumption of oxygen in grams per day. 
* ADG: average daily live weight gain in kilograms per day. 
* BW: live body weight in kilograms. 

## Code/software

Data are in csv format and can be opened in a variety of software packages. 
