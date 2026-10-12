README_V2

This Version 2 of the previously published dataset contains the timestamp of the observation, which give more information for performing data analysis through different methods.
   
This dataset reports labeled accelerometer data representing distinct behaviors of beef cattle grazing desert rangelands. It was used in machine learning experiments for supervised training and testing of behavior classification models (Perea et al., 2025) and for use in temporal and autoregressive methods for activity classification (Uysal et al., 2026). The dataset comprise a total of 9222 instances that were labeled according to two main classification states and four exclusive behaviors. The triaxial accelerometer data is summarized as one-dimensional motion index aggregated at a 1-minute interval. The animal behavior annotations were conducted using video recordings of focal animals from four breeds.  The videos were recorded during the Summer and Fall of 2022 at two different ranches. Animals were separated into herds by breed and grazed on separate rangeland pastures providing sufficient forage, mineral supplement, water and shade. All management procedures have been reviewed and approved by the New Mexico State University’s Institutional Animal Care and Use Committee (Protocol #3159-001)
Two behavior states and four behavior classes were annotated. The behavior states included Static or Active. The behavior classes included Walking, Grazing, Resting and Ruminating. All annotations were summarized at 1-minute intervals. The annotation of an exclusive behavior state or class was conducted for 1-minute intervals were if an animal performed the same behavior state or class for 30 seconds or longer. If the observed behavior lasted less than 30 seconds, the previous label annotation was considered. All annotated behaviors were synchronized with the accelerometer data, obtaining the final annotated dataset. This dataset provided a valuable source of accelerometer and behavior data of free-range cows.

Data structure          
The dataset comprise one .CSV file organized with the following columns:
-Breed: Correspond to the breed of cattle of focal cows
	AH: Angus-Hereford crossbreed
	BH: Brahman
	BR: Brangus
	RC: Raramuri criollo 

-ID: Corresponds to the ear tag identification number of focal cows 

-Time.MTD:It is the timestamp (M/D/Y h:mm:ss) in mountain time (MT) format, when the data was reported by the device via LoRaWAN in realtime.

-MI: Correspond to the accelerometer’s motion index value. The index summarizes multidimensional motion from triaxial accelerometers into a one-dimensional index aggregated every 1-minute.

-State: Correspond to the behavior state annotation, which is summarized at a 1-minute interval 
	AC: Active state was considered when cows exhibited horizontal displacement, either while walking with their head up (WA) or grazing with their head down (GR) while biting, chewing and searching for forage. 
	ST: Static state was considered when cows were either standing still or lying down, either fully resting (RE) or exhibiting gentle head, neck and jaw movements associated with rumination (RU). 

-Behavior: Correspond to the annotated behavior class representing one of four exclusive behaviors.
	WA: This class includes instances were cows exhibited horizontal displacement while walking with their head up.
	GR: This class includes instances were cow grazed with their head down while actively biting, chewing and searching for forage.
	RU: This class includes instances t were a static cow was either standing still or bedded down exhibiting gentle head, neck and jaw movements while chewing cud.
	RE: This class includes instances were a static cow was either standing still or bedded down fully resting.
 
