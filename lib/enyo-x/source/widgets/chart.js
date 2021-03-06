/*jshint bitwise:true, indent:2, curly:true, eqeqeq:true, immed:true,
latedef:true, newcap:true, noarg:true, regexp:true, undef:true,
trailing:true, white:true*/
/*global XT:true, XM:true, XV:true, _:true, window: true, enyo:true, nv:true, d3:true, console:true */

(function () {

  /**
    Generic implementation of customizable bar chart.
    You can pull in a filtered fetch on the
    backing collection for this chart. Then you can apply another arbitrary filter of your
    choice by means of a picker, and choose a group-by field. The kind will
    display a bar chart given the requirements. The "total" can be a count or
    a sum of a field of your choice. You can click on a bar to see a list of the
    items that comprise it, and drill down into an individual workspace from
    that list.

    Uses nvd3 for SVG rendering.
  */
  enyo.kind(
    /** @lends XV.SelectableChart */{
    name: "XV.SelectableChart",
    published: {
      // these published fields should not be overridden
      processedData: null,
      // this groupByAttr is set to undefined so as to distinguish
      // it from null or "", which could mean to groupBy all values
      groupByAttr: undefined,
      filterAttr: "",
      value: null, // the backing collection for chart generation
      model: null, // the backing chart model
      removeIconShowing: false, // show "x" icon to remove chart
      order: null, // order number of the chart

      // these ones can/should be overridden (although some have sensible defaults)
      chartTitle: "_chartTitle".loc(),
      collection: "", // {String} e.g. "XM.IncidentListItemCollection"
      drillDownRecordType: "",
      drillDownAttr: "",
      filterOptions: [], // these filters will be applied within the browser to the raw data from the fetch
      groupByOptions: [],
      query: { parameters: [] }, // if we want an initial filter on the collection fetch
      totalField: "" // what are we summing up in the bar chart (empty means just count)
    },
    classes: "selectable-chart",
    components: [
      {name: "chartTitleBar", classes: "chart-title-bar", components: [
        {name: "chartTitle", classes: "chart-title"},
        {kind: "onyx.IconButton", name: "removeIcon",
          src: "/assets/remove-icon.png", ontap: "chartRemoved",
          classes: "remove-icon", showing: false}
      ]},

      {name: "chartWrapper", classes: "chart-bottom", components: [
        {name: "chart", components: [
          {name: "svg", tag: "svg"} // this is the DOM element that d3 will take over
        ]},
        {kind: "enyo.FittableColumns", components: [
          {content: "_filterOn".loc() + ": ", classes: "xv-picker-label", name: "filterPickerLabel"},
          {kind: "onyx.PickerDecorator",
            name: "filterPickerDecorator",
            onSelect: "filterSelected",
            classes: "xv-input-decorator",
            components: [{content: "_chooseOne".loc()}, {kind: "onyx.Picker", name: "filterPicker"}]
          },
          {content: "_groupBy".loc() + ": ", classes: "xv-picker-label"},
          {kind: "onyx.PickerDecorator", onSelect: "groupBySelected", components: [
            {content: "_chooseOne".loc()},
            {kind: "onyx.Picker", name: "groupByPicker"}
          ]}
        ]}
      ]}
    ],
    events: {
      onChartRemove: "",
      onSearch: "",
      onWorkspace: "",
      onStatusChange: ""
    },
    /**
      Get the grouped data in the JSON format the chart wants. Up to the implementation.
     */
    aggregateData: function (groupedData) {
      return groupedData;
    },
    /**
      Remove this chart from it's parent (if applicable)
    */
    chartRemoved: function (inSender, inEvent) {
      inEvent.model = this.getModel();
      this.doChartRemove(inEvent);
    },
    /**
      Kick off the fetch on the collection as soon as we start.
     */
    create: function () {
      this.inherited(arguments);

      var that = this,
        collection = this.getCollection(),
        Klass = collection ? XT.getObjectByName(collection) : false;

      //
      // Show/Hide remove icon
      //
      this.$.removeIcon.setShowing(this.removeIconShowing);

      //
      // Set the chart title
      //
      this.$.chartTitle.setContent(this.getChartTitle());

      //
      // Make and fetch the collection
      //
      if (!Klass) {
        console.log("Error: cannot find collection", collection);
        return;
      }

      this.setValue(new Klass());
      this.getValue().fetch({
        query: this.getQuery(),
        success: function (collection, results) {
          //
          // Populate the filter picker
          //
          _.each(that.getFilterOptions(), function (item) {
            item.content = item.content || ("_" + item.name).loc(); // default content
            if (that.getFilterOptions().length === 1) {
              // if there's only one option, no need to show the picker
              that.$.filterPickerLabel.setShowing(false);
              that.$.filterPickerDecorator.setShowing(false);
              that.setFilterAttr(item.name);
            }
            that.$.filterPicker.createComponent(item);
          });

          //
          // Populate the groupBy picker
          //
          _.each(that.getGroupByOptions(), function (item) {
            item.content = item.content || ("_" + (item.name || "all")).loc(); // default content
            that.$.groupByPicker.createComponent(item);
          });

          // Set the values in the pickers, initialize model
          that.modelChanged();

          // Set the order of the chart
          that.orderChanged();

          //
          // Save the data results
          //
          that.processData();
        }
      });
    },
    /**
      It is up to the subkinds to implement whatever filter they see fit
      based on the backing collection and the choice of this.getFilterAttr().
    */
    filterData: function (data, callback) {
      callback(data);
    },
    /**
      When the filter value changes, set the selected value
      in the picker widget and re-process the data.
    */
    filterAttrChanged: function () {
      var that = this,
        selected = _.find(this.$.filterPicker.controls, function (option) {
          return option.name === that.getFilterAttr();
        });
      if (selected) {
        this.$.filterPicker.setSelected(selected);
      }
      this.processData();
    },
    /**
      A new filter value was selected in the picker. Set
      the published filter attribute and the model.
    */
    filterSelected: function (inSender, inEvent) {
      this.setFilterAttr(inEvent.originator.name);
      this.getModel().set("filter", inEvent.originator.name);
    },
    /**
      When the groupBy value changes, set the selected value
      in the picker widget and re-process the data.
    */
    groupByAttrChanged: function () {
      var that = this,
        selected = _.find(this.$.groupByPicker.controls, function (option) {
          return option.name === that.getGroupByAttr();
        });
      this.$.groupByPicker.setSelected(selected);
      this.processData();
    },
    /**
      A new groupBy value was selected in the picker. Set
      the published groupBy attribute and the model.
    */
    groupBySelected: function (inSender, inEvent) {
      this.setGroupByAttr(inEvent.originator.name);
      this.getModel().set("groupBy", inEvent.originator.name);
    },
    /**
      Set the filter values from the model. Set binding
      on the new model.
    */
    modelChanged: function () {
      var model = this.getModel(), K = XM.Model,
        filter = model.get("filter") ? model.get("filter") : "all";
      this.setFilterAttr(filter);
      this.setGroupByAttr(model.get("groupBy"));
      this.setBindings('on');
    },
    orderChanged: function () {
      this.getModel().set("order", this.getOrder());
    },
    /**
      Make the chart using v3 and nv.d3, working off our this.processedData.
     */
    plot: function () {
      // up to the implementation
    },
    /**
      Take the raw data and process it according to the specifiations
      dictated by the pickers.
     */
    processData: function () {
      if (!this.getValue().length ||
          !this.getFilterAttr() ||
          this.getGroupByAttr() === undefined) {
        // not ready to aggregate
        return;
      }
      var that = this;

      // apply arbitrary filter as defined by subkind (async)
      this.filterData(this.getValue().models, function (filteredData) {
        var groupedData, aggregatedData;

        // Group on the selected group-by field. This gets tricky
        // if the field is a submodel.
        groupedData = _.groupBy(filteredData, function (datum) {
          if (!that.getGroupByAttr() || !datum.get(that.getGroupByAttr())) {
            return null;
          } else if (typeof datum.get(that.getGroupByAttr()) === 'object') {
            return datum.get(that.getGroupByAttr()).id;
          } else {
            return datum.get(that.getGroupByAttr());
          }
        });

        // data aggregation will be different for each implementation
        aggregatedData = that.aggregateData(groupedData);

        that.setProcessedData(aggregatedData);
      });
    },
    processedDataChanged: function () {
      this.plot();
    },
    /**
      After render, replot the charts.
    */
    rendered: function () {
      this.inherited(arguments);
      this.processData();
    },
    /**
      Set model bindings on the chart
    */
    setBindings: function (action) {
      action = action || 'on';
      this.model[action]("statusChange", this.statusChanged, this);
    },
    /**
      Bubble a status changed event to the Dashboard so that it
      can control the spinner and save buttons.
    */
    statusChanged: function (model, status, options) {
      var inEvent = {model: model, status: status};
      this.doStatusChange(inEvent);
    }
  });

  enyo.kind({
    name: "XV.DrilldownBarChart",
    kind: "XV.SelectableChart",
    filterOptions: [
      { name: "all", parameters: [] }
    ],
    aggregateData: function (groupedData) {
      var that = this,
        aggregatedData = _.map(groupedData, function (datum, key) {
          var reduction = _.reduce(datum, function (memo, row) {
            // if the total field is not specified, we just count.
            var increment = that.getTotalField() ? row.get(that.getTotalField()) : 1;
            return {
              label: memo.label === 'null' ? "_none".loc() : memo.label || "_none".loc(),
              value: memo.value + increment
            };
          }, {label: key, value: 0});
          return reduction;
        });
      return [{values: aggregatedData}];
    },
    /**
      If the user clicks on a bar we open up the SalesHistory list with the appropriate
      filter. When the user clicks on an list item we drill down further into the sales
      order.
     */
    drillDown: function (field, key) {
      var that = this,
        recordType = this.getValue().model.prototype.recordType,
        listKind = XV.getList(recordType),
        params = [{
          name: field,
          value: key
        }],
        callback = function (value) {
          // unless explicitly specified, we assume that we want to drill down
          // into the same model that is fuelling the report
          var drillDownRecordType = that.getDrillDownRecordType() ||
              that.getValue().model.prototype.recordType,
            drillDownAttribute = that.getDrillDownAttr() ||
              XT.getObjectByName(drillDownRecordType).prototype.idAttribute,
            id = value.get(drillDownAttribute);

          if (id) {
            that.doWorkspace({workspace: XV.getWorkspace(drillDownRecordType), id: id});
          }
          // TODO: do anything if id is not present?
        };

      // TODO: the parameter widget sometimes has trouble finding our query requests
      this.doSearch({
        list: listKind,
        searchText: "",
        callback: callback,
        parameterItemValues: params,
        conditions: _.union(this.getQuery().parameters, this.getFilterOptionParameters()),
        query: null
      });
    },
    filterData: function (data, callback) {
      var that = this,
        doubleFilteredQuery = JSON.parse(JSON.stringify(this.getQuery())),
        optionParameters = this.getFilterOptionParameters();

      doubleFilteredQuery.parameters = _.union(doubleFilteredQuery.parameters, optionParameters);

      this.getValue().fetch({
        query: doubleFilteredQuery,
        success: function (collection, results) {
          callback(collection.models);
        },
        error: function () {
          console.log("error in double-filtered query", arguments);
        }
      });
    },
    getFilterOptionParameters: function () {
      var that = this,
        filterOption = _.find(this.getFilterOptions(), function (option) {
          return option.name === that.getFilterAttr();
        });

      return filterOption.parameters;
    },
    /**
      Make the chart using v3 and nv.d3, working off our this.processedData.
     */
    plot: function () {
      var that = this,
        div = this.$.svg.hasNode();

      //nv.addGraph(function () {
      var chart = nv.models.discreteBarChart()
        .x(function (d) { return d.label; })
        .y(function (d) { return d.value; })
        .valueFormat(d3.format(',.0f'))
        .staggerLabels(true)
        .tooltips(false)
        .showValues(true)
        .width(400);

      chart.yAxis
        .tickFormat(d3.format(',.0f'));
      chart.margin({left: 80});

      d3.select(div)
        .datum(this.getProcessedData())
        .transition().duration(500)
        .call(chart);

      d3.selectAll(".nv-bar").on("click", function (bar, index) {
        that.drillDown(that.getGroupByAttr(), bar.label);
      });

        //nv.utils.windowResize(chart.update);
        //return chart;
      //});
    }
  });

  enyo.kind({
    name: "XV.TimeSeriesChart",
    kind: "XV.SelectableChart",
    published: {
      dateField: ""
    },
    filterOptions: [
      { name: "thisWeek" },
      { name: "thisMonth" },
      { name: "thisYear" },
      { name: "twoYears" },
      { name: "fiveYears" }
    ],
    /**
      This looks really complicated! I'm just binning the
      data into a histogram.
     */
    aggregateData: function (groupedData) {
      var that = this,
        now = new Date().getTime(),
        earliestDate = now, // won't be now for long
        dataPoints = _.reduce(groupedData, function (memo, group) {
          _.each(group, function (item) {
            var dateInt = item.get(that.getDateField()).getTime();
            earliestDate = Math.min(earliestDate, dateInt);
          });
          return memo + group.length;
        }, 0),
        binCount = Math.ceil(Math.sqrt(dataPoints)),
        binWidth = Math.ceil((now - earliestDate) / binCount),
        histoGroup = _.map(groupedData, function (group, groupKey) {
          var binnedData, summedData, hole, findHole, foundData;

          binnedData = _.groupBy(group, function (item) {
            var binNumber = Math.floor((item.get(that.getDateField()).getTime() - earliestDate) / binWidth);
            // we actually want to return the timestamp at the start of the bin, for later use
            return (binNumber * binWidth) + earliestDate;
          });
          summedData = _.map(binnedData, function (bin, binKey) {
            var binTotal = _.reduce(bin, function (memo, value, key) {
              return memo + value.get(that.getTotalField());
            }, 0);
            return {x: binKey, y: binTotal};
          });
          // plug in zeros for missing data. Necessary for nvd3 stacking.
          findHole = function (datum) {
            return datum.x === String(hole);
          };
          for (hole = earliestDate; hole <= now; hole += binWidth) {
            foundData = _.find(summedData, findHole);
            if (!foundData) {
              summedData.push({x: String(hole), y: 0});
            }
          }
          summedData = _.sortBy(summedData, function (data) {
            return data.x;
          });
          groupKey = groupKey === 'null' ? "_none".loc() : groupKey || "_none".loc();
          return {key: groupKey, values: summedData};
        });

      return histoGroup;
    },
    filterData: function (data, callback) {
      var that = this;

      callback(_.filter(data, function (datum) {
        var shipDate = datum.get(that.getDateField()).getTime(),
          now = new Date().getTime(),
          timespan = 0,
          oneDay = 1000 * 60 * 60 * 24;

        // XXX use YTD etc.?
        switch (that.getFilterAttr()) {
        case "today":
          timespan = oneDay;
          break;
        case "thisWeek":
          timespan = 7 * oneDay;
          break;
        case "thisMonth":
          timespan = 30 * oneDay;
          break;
        case "thisYear":
          timespan = 365 * oneDay;
          break;
        case "twoYears":
          timespan = 2 * 365 * oneDay;
          break;
        case "fiveYears":
          timespan = 5 * 365 * oneDay;
          break;
        }
        return shipDate + timespan >= now;
      }));
    },
    /**
      Make the chart using v3 and nv.d3, working off our this.processedData.
     */
    plot: function () {
      var that = this,
        div = this.$.svg.hasNode();

      var chart = nv.models.multiBarChart()
        .stacked(true);

      chart.xAxis
        .tickFormat(function (d) { return d3.time.format('%b %d %y')(new Date(Number(d))); });

      chart.yAxis
        .tickFormat(d3.format(',.0f'));
      chart.margin({left: 80});

      d3.select(div)
        .datum(this.getProcessedData())
        .transition().duration(500)
        .call(chart);
    },
  });

  // This one ended up not looking good for sales history, but it might
  // be useful somewhere else
  /*
  enyo.kind({
    name: "XV.TimeSeriesLineChart",
    kind: "XV.SelectableChart",
    published: {
      dateField: ""
    },
    aggregateData: function (groupedData) {
      var that = this;

      return _.map(groupedData, function (group, key) {
        var groupValues = _.map(group, function (modelData) {
          return {
            x: modelData.get(that.getDateField()).getTime(),
            y: modelData.get(that.getTotalField())
          };
        });

        return {
          key: key,
          values: groupValues
        };
      });
    },
    plot: function () {
      var that = this,
        div = this.$.svg.hasNode();

      var chart = nv.models.lineChart();
      chart.xAxis
        .tickFormat(function (d) { return d3.time.format('%b %d %y')(new Date(d)); });

      d3.select(div)
        .datum(this.getProcessedData())
        .transition().duration(500)
        .call(chart);
    },
  });
  */
}());
